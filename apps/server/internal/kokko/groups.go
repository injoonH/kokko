package kokko

import (
	"database/sql"
	"errors"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

const LegacyGroup = "legacy"

type Group struct {
	ID         string `json:"id" db:"id"`
	Name       string `json:"name" db:"name"`
	Visibility string `json:"visibility" db:"visibility"`
	Role       string `json:"role" db:"role"`
	Revision   int    `json:"-" db:"revision"`
}

func groupID(id string) string {
	if id == "" {
		return LegacyGroup
	}
	return id
}
func moderator(g Group) bool { return g.Role == "owner" || g.Role == "moderator" }

// Account administrators have no implicit access to a group's private records.
func groupMember(app core.App, actor, id string) (Group, error) {
	var g Group
	if _, err := member(app, actor, false); err != nil {
		return g, err
	}
	err := app.DB().NewQuery(`SELECT g.id,g.name,g.visibility,g.revision,m.role FROM kokko_groups g
 JOIN kokko_group_members m ON m.group_id=g.id WHERE g.id={:g} AND m.player_id={:a} AND m.status='active'`).Bind(dbx.Params{"g": groupID(id), "a": actor}).One(&g)
	if errors.Is(err, sql.ErrNoRows) {
		return g, fail(404, "참여 중인 모임을 찾을 수 없습니다.")
	}
	return g, err
}
func ownGroups(app core.App, actor string) ([]Group, error) {
	out := []Group{}
	err := app.DB().NewQuery(`SELECT g.id,g.name,g.visibility,g.revision,m.role FROM kokko_groups g
 JOIN kokko_group_members m ON m.group_id=g.id JOIN users u ON u.id=m.player_id
 WHERE m.player_id={:a} AND m.status='active' AND u.status='active'
 ORDER BY (g.id='legacy') DESC,g.created,g.id`).Bind(dbx.Params{"a": actor}).All(&out)
	return out, err
}
func bumpGroup(app core.App, id string) error {
	return exec(app, "UPDATE kokko_groups SET revision=revision+1 WHERE id={:g}", dbx.Params{"g": id})
}
func profileChanged(app core.App, id string) error {
	if err := exec(app, `UPDATE kokko_groups SET revision=revision+1 WHERE id IN (
 SELECT group_id FROM kokko_group_members WHERE player_id={:p}
 UNION SELECT m.group_id FROM kokko_matches m JOIN kokko_participants p ON p.match_id=m.id WHERE p.player_id={:p})`, dbx.Params{"p": id}); err != nil {
		return err
	}
	return exec(app, "UPDATE kokko_meta SET revision=revision+1 WHERE id=1", nil)
}
func groupDayVersions(app core.App, id string) (map[string]int, error) {
	rows := []struct {
		Date    string `db:"played_on"`
		Version int    `db:"version"`
	}{}
	err := app.DB().NewQuery("SELECT played_on,version FROM kokko_group_days WHERE group_id={:g}").Bind(dbx.Params{"g": id}).All(&rows)
	out := map[string]int{}
	for _, r := range rows {
		out[r.Date] = r.Version
	}
	return out, err
}
func localMatches(ms []Match, id string) []Match {
	out := []Match{}
	date := ""
	order := 0
	for _, m := range ms {
		if groupID(m.GroupID) != id {
			continue
		}
		if m.Date != date {
			date = m.Date
			order = 0
		}
		if !m.Deleted {
			order++
			m.Order = order
		} else {
			m.Order = 0
		}
		out = append(out, m)
	}
	return out
}
func matchView(ms []Match, m Match) Match {
	for _, v := range localMatches(ms, groupID(m.GroupID)) {
		if v.ID == m.ID {
			return v
		}
	}
	return m
}

// Local positions never expose another group's positions. Preserve the global
// slot on ordinary same-position edits. Explicit placement uses a visible
// same-group anchor; a new default append goes at the global day's end.
func placeMatch(app core.App, ms []Match, m, old Match, found bool, q Mutation, dates []string) (Match, error) {
	oldLocal := matchView(ms, old).Order
	for _, date := range dates {
		list := []Match{}
		for _, x := range ms {
			if x.Date == date && x.ID != m.ID && !x.Deleted {
				list = append(list, x)
			}
		}
		ordered(list)
		if date == m.Date && !m.Deleted {
			own := []int{}
			for i, x := range list {
				if x.GroupID == m.GroupID {
					own = append(own, i)
				}
			}
			pos := q.Position
			if pos < 0 || pos > len(own)+1 {
				return m, fail(400, "경기 순서 범위를 확인해 주세요.")
			}
			index := len(list)
			if found && !old.Deleted && old.Date == m.Date && q.Action != "restore" && (pos == 0 || pos == oldLocal) {
				index = 0
				for _, x := range list {
					if x.Order < old.Order {
						index++
					}
				}
			} else if pos > 0 {
				if pos <= len(own) {
					index = own[pos-1]
				} else if len(own) > 0 {
					index = own[len(own)-1] + 1
				}
			}
			list = slices.Insert(list, index, m)
		}
		for i := range list {
			list[i].Order = i + 1
			if list[i].ID == m.ID {
				m.Order = i + 1
			}
			if err := saveMatch(app, list[i]); err != nil {
				return m, err
			}
		}
		if err := exec(app, `INSERT INTO kokko_days VALUES({:d},1) ON CONFLICT(played_on) DO UPDATE SET version=version+1`, dbx.Params{"d": date}); err != nil {
			return m, err
		}
		if err := exec(app, `INSERT INTO kokko_group_days VALUES({:g},{:d},1) ON CONFLICT(group_id,played_on) DO UPDATE SET version=version+1`, dbx.Params{"g": m.GroupID, "d": date}); err != nil {
			return m, err
		}
	}
	return m, nil
}

// CreateGroup and SetGroupMember are offline operator tools for this gated
// isolation release. Public creation/joining and owner UI are a later phase.
func (s *Service) CreateGroup(name, owner string) (string, error) {
	name = strings.TrimSpace(name)
	if !utf8.ValidString(name) || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 40 {
		return "", fail(400, "모임 이름은 1~40자로 입력해 주세요.")
	}
	id := security.RandomString(15)
	err := s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, owner, false); err != nil {
			return err
		}
		if err := exec(app, "INSERT INTO kokko_groups(id,name,visibility,created) VALUES({:g},{:n},'private',{:t})", dbx.Params{"g": id, "n": name, "t": s.Now().UTC().Format(time.RFC3339)}); err != nil {
			return err
		}
		return exec(app, "INSERT INTO kokko_group_members VALUES({:g},{:p},'owner','active')", dbx.Params{"g": id, "p": owner})
	})
	return id, err
}
func (s *Service) SetGroupMember(id, player, role string) error {
	if role != "member" && role != "moderator" && role != "left" && role != "blocked" {
		return fail(400, "모임 역할을 확인해 주세요.")
	}
	return s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, player, false); err != nil {
			return err
		}
		var current struct {
			Role string `db:"role"`
		}
		rows := []struct {
			Role string `db:"role"`
		}{}
		if err := app.DB().NewQuery("SELECT role FROM kokko_group_members WHERE group_id={:g} AND player_id={:p}").Bind(dbx.Params{"g": id, "p": player}).All(&rows); err != nil {
			return err
		}
		if len(rows) > 0 {
			current.Role = rows[0].Role
		}
		if current.Role == "owner" {
			return fail(409, "모임 소유자의 역할은 이 명령으로 변경할 수 없습니다.")
		}
		status := "active"
		if role == "left" || role == "blocked" {
			status = role
			role = "member"
		}
		if err := exec(app, `INSERT INTO kokko_group_members(group_id,player_id,role,status) VALUES({:g},{:p},{:r},{:s})
 ON CONFLICT(group_id,player_id) DO UPDATE SET role=excluded.role,status=excluded.status`, dbx.Params{"g": id, "p": player, "r": role, "s": status}); err != nil {
			return err
		}
		return bumpGroup(app, id)
	})
}

type Revision struct {
	Actor   string `json:"actor" db:"actor"`
	Action  string `json:"action" db:"action"`
	Created string `json:"created" db:"created"`
	Before  string `json:"before" db:"before"`
	After   string `json:"after" db:"after"`
}

func (s *Service) Revisions(actor, id, match string) ([]Revision, error) {
	out := []Revision{}
	err := s.App.RunInTransaction(func(app core.App) error {
		g, err := groupMember(app, actor, id)
		if err != nil {
			return err
		}
		var m struct {
			Author string `db:"author"`
		}
		if err = app.DB().NewQuery("SELECT json_extract(data,'$.author') AS author FROM kokko_matches WHERE id={:m} AND group_id={:g}").Bind(dbx.Params{"m": match, "g": g.ID}).One(&m); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return fail(404, "경기를 찾을 수 없습니다.")
			}
			return err
		}
		if m.Author != actor && !moderator(g) {
			return fail(403, "변경 이력을 볼 권한이 없습니다.")
		}
		return app.DB().NewQuery("SELECT actor,action,created,before,after FROM kokko_revisions WHERE match_id={:m} ORDER BY created,id").Bind(dbx.Params{"m": match}).All(&out)
	})
	return out, err
}
