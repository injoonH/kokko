package kokko

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

type Service struct {
	App          core.App
	mu           sync.Mutex
	Now          func() time.Time
	PublicSignup bool
	RankedStart  string
}

func New(app core.App) *Service { return &Service{App: app, Now: time.Now} }
func hash(s string) string      { v := sha256.Sum256([]byte(s)); return hex.EncodeToString(v[:]) }
func exec(app core.App, sql string, p dbx.Params) error {
	_, err := app.DB().NewQuery(sql).Bind(p).Execute()
	return err
}
func member(app core.App, id string, admin bool) (*core.Record, error) {
	u, err := app.FindRecordById("users", id)
	if err != nil || u.GetString("status") != "active" {
		return nil, fail(403, "가입을 완료한 회원만 이용할 수 있습니다.")
	}
	if admin && u.GetString("role") != "admin" {
		return nil, fail(403, "관리자만 이용할 수 있습니다.")
	}
	return u, nil
}
func loadMatches(app core.App) ([]Match, error) {
	rows := []struct {
		Data string `db:"data"`
	}{}
	err := app.DB().NewQuery("SELECT data FROM kokko_matches ORDER BY played_on,day_order,id").All(&rows)
	if err != nil {
		return nil, err
	}
	out := []Match{}
	for _, r := range rows {
		var m Match
		if err = json.Unmarshal([]byte(r.Data), &m); err != nil {
			return nil, err
		}
		m.GroupID = groupID(m.GroupID)
		out = append(out, m)
	}
	return out, nil
}
func saveMatch(app core.App, m Match) error {
	m.GroupID = groupID(m.GroupID)
	return exec(app, `INSERT INTO kokko_matches(id,played_on,day_order,kind,data,group_id) VALUES({:id},{:date},{:ord},{:kind},{:data},{:group}) ON CONFLICT(id) DO UPDATE SET played_on=excluded.played_on,day_order=excluded.day_order,kind=excluded.kind,data=excluded.data`, dbx.Params{"id": m.ID, "date": m.Date, "ord": m.Order, "kind": m.Kind, "data": encode(m), "group": m.GroupID})
}
func dayVersions(app core.App) (map[string]int, error) {
	return groupDayVersions(app, LegacyGroup)
}
func (s *Service) Mutate(actor string, q Mutation) (Match, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var result Match
	if len(q.RequestID) < 16 || len(q.RequestID) > 80 {
		return result, fail(400, "저장 요청 식별자가 올바르지 않습니다.")
	}
	err := s.App.RunInTransaction(func(app core.App) error {
		g, err := groupMember(app, actor, q.GroupID)
		if err != nil {
			return err
		}
		admin := moderator(g)
		if err := ensureRatings(app); err != nil {
			return err
		}
		rows := []struct {
			Hash   string `db:"hash"`
			Result string `db:"result"`
		}{}
		if err = app.DB().NewQuery("SELECT hash,result FROM kokko_requests WHERE actor={:a} AND request_id={:r}").Bind(dbx.Params{"a": actor, "r": q.RequestID}).All(&rows); err != nil {
			return err
		}
		fingerprint := hash(encode(q))
		if len(rows) > 0 {
			if rows[0].Hash != fingerprint {
				return fail(409, "같은 저장 요청의 내용이 달라졌습니다. 기록을 확인하고 다시 저장해 주세요.")
			}
			if err = json.Unmarshal([]byte(rows[0].Result), &result); err != nil {
				return err
			}
			if groupID(result.GroupID) != g.ID {
				return fail(409, "같은 저장 요청의 모임이 달라졌습니다.")
			}
			result.GroupID = g.ID
			return nil
		}
		ms, err := loadMatches(app)
		if err != nil {
			return err
		}
		var old Match
		found := false
		for _, m := range ms {
			if m.ID == q.ID && m.GroupID == g.ID {
				old = m
				found = true
				break
			}
		}
		now := s.Now().UTC().Format(time.RFC3339Nano)
		m := old
		if q.Action == "create" {
			if q.ID != "" {
				return fail(400, "새 경기의 ID를 지정할 수 없습니다.")
			}
			m = Match{ID: security.RandomString(15), Author: actor, Version: 1, Created: now, GroupID: g.ID}
			m.Kind = q.Kind
			m.Date = q.Date
			m.A = q.A
			m.B = q.B
			m.ScoreA = q.ScoreA
			m.ScoreB = q.ScoreB
		} else {
			if !found {
				return fail(404, "경기를 찾을 수 없습니다.")
			}
			if !admin && old.Author != actor {
				return fail(403, "작성자 또는 관리자만 변경할 수 있습니다.")
			}
			if q.Version != old.Version {
				return fail(409, "다른 사람이 경기를 변경했습니다. 최신 기록을 확인해 주세요.")
			}
			m.Version++
			switch q.Action {
			case "edit":
				if m.Deleted {
					return fail(409, "삭제된 경기는 먼저 복구해 주세요.")
				}
				m.Kind = q.Kind
				m.Date = q.Date
				m.A = q.A
				m.B = q.B
				m.ScoreA = q.ScoreA
				m.ScoreB = q.ScoreB
			case "move":
				if m.Deleted {
					return fail(409, "삭제된 경기는 이동할 수 없습니다.")
				}
				if q.Position < 1 {
					return fail(400, "이동할 순서를 선택해 주세요.")
				}
			case "delete":
				if m.Deleted {
					return fail(409, "이미 삭제된 경기입니다.")
				}
				m.Deleted = true
			case "restore":
				if !admin {
					return fail(403, "관리자만 복구할 수 있습니다.")
				}
				if !m.Deleted {
					return fail(409, "삭제되지 않은 경기입니다.")
				}
				m.Deleted = false
			default:
				return fail(400, "알 수 없는 변경 요청입니다.")
			}
		}
		if err = Validate(m, s.Now()); err != nil {
			return err
		}
		if q.Action == "create" || (!admin && (q.Action == "edit" || q.Action == "move")) {
			if !participant(m, actor) {
				return fail(403, "본인이 참가한 경기만 기록하거나 수정할 수 있습니다.")
			}
		}
		for _, p := range append(slices.Clone(m.A), m.B...) {
			r, err := app.FindRecordById("users", p)
			if err != nil {
				return fail(400, "등록된 선수를 선택해 주세요.")
			}
			if r.GetString("status") != "active" && !(found && participant(old, p)) {
				return fail(400, "활성 회원만 새 참가자로 선택할 수 있습니다.")
			}
			var count struct {
				N int `db:"n"`
			}
			if err = app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_group_members WHERE player_id={:id} AND group_id={:g} AND status='active'").Bind(dbx.Params{"id": p, "g": g.ID}).One(&count); err != nil {
				return err
			}
			if count.N != 1 && !(found && participant(old, p)) {
				return fail(400, "이 모임에 참여 중인 선수를 선택해 주세요.")
			}
		}
		versions, err := groupDayVersions(app, g.ID)
		if err != nil {
			return err
		}
		dates := []string{m.Date}
		if found && old.Date != m.Date {
			dates = append(dates, old.Date)
		}
		// A new append has no stale ordering intent; explicit placement and mutations do.
		if q.Action != "create" || q.Position > 0 {
			for _, d := range dates {
				v, ok := q.DayVersions[d]
				if !ok || v != versions[d] {
					return fail(409, "이 날짜의 경기 순서가 변경되었습니다. 새로고침 후 다시 시도해 주세요.")
				}
			}
		}
		m.Updated = now
		beforeView := old
		for _, v := range localMatches(ms, g.ID) {
			if v.ID == old.ID {
				beforeView = v
				break
			}
		}
		m, err = placeMatch(app, ms, m, old, found, q, dates)
		if err != nil {
			return err
		}

		if err = saveMatch(app, m); err != nil {
			return err
		}
		if err = exec(app, "DELETE FROM kokko_participants WHERE match_id={:id}", dbx.Params{"id": m.ID}); err != nil {
			return err
		}
		for side, ps := range [][]string{m.A, m.B} {
			team := "A"
			if side == 1 {
				team = "B"
			}
			for slot, p := range ps {
				if err = exec(app, "INSERT INTO kokko_participants VALUES({:m},{:p},{:t},{:s})", dbx.Params{"m": m.ID, "p": p, "t": team, "s": slot}); err != nil {
					return err
				}
			}
		}
		ms, err = loadMatches(app)
		if err != nil {
			return err
		}
		if err = exec(app, "INSERT INTO kokko_revisions VALUES({:id},{:m},{:a},{:action},{:now},{:before},{:after})", dbx.Params{"id": security.RandomString(15), "m": m.ID, "a": actor, "action": q.Action, "now": now, "before": encode(beforeView), "after": encode(matchView(ms, m))}); err != nil {
			return err
		}
		pools := []string{m.Kind}
		if found && old.Kind != m.Kind {
			pools = []string{old.Kind, m.Kind}
		}
		for _, kind := range pools {
			if err = rebuild(app, ms, kind); err != nil {
				return err
			}
		}
		if err = exec(app, "UPDATE kokko_meta SET revision=revision+1 WHERE id=1", nil); err != nil {
			return err
		}
		if err = bumpGroup(app, g.ID); err != nil {
			return err
		}
		result = matchView(ms, m)
		return exec(app, "INSERT INTO kokko_requests VALUES({:a},{:r},{:h},{:result})", dbx.Params{"a": actor, "r": q.RequestID, "h": fingerprint, "result": encode(result)})
	})
	return result, err
}
func rebuild(app core.App, ms []Match, kind string) error {
	history, ratings := Replay(ms, kind)
	return replaceRatings(app, kind, history, ratings)
}

func replaceRatings(app core.App, kind string, rs []Rating, ranks []Ranking) error {
	if err := exec(app, "DELETE FROM kokko_rating_history WHERE kind={:k}", dbx.Params{"k": kind}); err != nil {
		return err
	}
	if err := exec(app, "DELETE FROM kokko_ratings WHERE kind={:k}", dbx.Params{"k": kind}); err != nil {
		return err
	}
	for _, r := range rs {
		if err := exec(app, "INSERT INTO kokko_rating_history(match_id,player_id,kind,before,after,delta,expected,before_rd,after_rd) VALUES({:m},{:p},{:k},{:b},{:a},{:d},{:e},{:br},{:ar})", dbx.Params{"m": r.MatchID, "p": r.PlayerID, "k": kind, "b": r.Before, "a": r.After, "d": r.Delta, "e": r.Expected, "br": r.BeforeRD, "ar": r.AfterRD}); err != nil {
			return err
		}
	}
	for _, r := range ranks {
		if err := exec(app, "INSERT INTO kokko_ratings(player_id,kind,rating,games,rd,last_played) VALUES({:p},{:k},{:r},{:g},{:rd},{:last})", dbx.Params{"p": r.PlayerID, "k": kind, "r": r.Rating, "g": r.Games, "rd": r.RD, "last": r.LastPlayed}); err != nil {
			return err
		}
	}
	return nil
}

// EnsureRatings is called after schema migrations and before the HTTP server
// starts. The flag, both current pools, histories and revision commit together.
// Failure leaves the prior data intact and prevents the server from starting.
func (s *Service) EnsureRatings() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.App.RunInTransaction(ensureRatings)
}

func ensureRatings(app core.App) error {
	var meta struct {
		System int `db:"rating_system"`
	}
	if err := app.DB().NewQuery("SELECT rating_system FROM kokko_meta WHERE id=1").One(&meta); err != nil {
		return err
	}
	if meta.System == RatingSystem {
		return nil
	}
	if meta.System != 0 {
		return fmt.Errorf("unsupported rating system %d", meta.System)
	}
	ms, err := loadMatches(app)
	if err != nil {
		return err
	}
	for _, kind := range []string{"singles", "doubles"} {
		if err = rebuild(app, ms, kind); err != nil {
			return err
		}
	}
	if err = exec(app, "UPDATE kokko_groups SET revision=revision+1", nil); err != nil {
		return err
	}
	return exec(app, "UPDATE kokko_meta SET rating_system={:s},revision=revision+1 WHERE id=1", dbx.Params{"s": RatingSystem})
}

type RatingPreview struct {
	Matches     int     `json:"matches"`
	History     int     `json:"history"`
	Players     int     `json:"players"`
	Changed     int     `json:"changed"`
	MaxChange   float64 `json:"maxChange"`
	MatchDigest string  `json:"matchDigest"`
}

// PreviewRatings reads domain data without migrating or changing it. Run the
// operator command against a stopped server or an isolated backup copy.
func (s *Service) PreviewRatings() (RatingPreview, error) {
	ms, err := loadMatches(s.App)
	if err != nil {
		return RatingPreview{}, err
	}
	previous := []struct {
		PlayerID string  `db:"player_id"`
		Kind     string  `db:"kind"`
		Rating   float64 `db:"rating"`
	}{}
	if err = s.App.DB().NewQuery("SELECT player_id,kind,rating FROM kokko_ratings").All(&previous); err != nil {
		return RatingPreview{}, err
	}
	out := RatingPreview{Matches: len(ms), MatchDigest: hash(encode(ms))}
	players := map[string]bool{}
	for _, kind := range []string{"singles", "doubles"} {
		history, ranks := Replay(ms, kind)
		out.History += len(history)
		for _, r := range ranks {
			players[r.PlayerID] = true
			old := Initial
			for _, p := range previous {
				if p.PlayerID == r.PlayerID && p.Kind == kind {
					old = p.Rating
					break
				}
			}
			change := math.Abs(old - r.Rating)
			if change > 1e-9 {
				out.Changed++
			}
			out.MaxChange = math.Max(out.MaxChange, change)
		}
	}
	out.Players = len(players)
	return out, nil
}

type Invitation struct {
	ID         string `json:"id" db:"id"`
	CreatedBy  string `json:"createdBy" db:"created_by"`
	Created    string `json:"created" db:"created"`
	Expires    string `json:"expires" db:"expires"`
	Disabled   bool   `json:"disabled" db:"disabled"`
	RedeemedBy string `json:"redeemedBy" db:"redeemed_by"`
	RedeemedAt string `json:"redeemedAt" db:"redeemed_at"`
	GroupID    string `json:"groupId" db:"group_id"`
}

func (s *Service) CreateInvitation(actor string, setup bool) (string, error) {
	return s.CreateGroupInvitation(actor, LegacyGroup, setup)
}
func (s *Service) CreateGroupInvitation(actor, id string, setup bool) (string, error) {
	code := security.RandomString(32)
	err := s.App.RunInTransaction(func(app core.App) error {
		if !setup {
			g, err := groupMember(app, actor, id)
			if err != nil {
				return err
			}
			if !moderator(g) {
				return fail(403, "모임 관리자만 초대할 수 있습니다.")
			}
		}
		now := s.Now().UTC()
		return exec(app, "INSERT INTO kokko_invitations(id,hash,created_by,created,expires,group_id) VALUES({:id},{:h},{:a},{:c},{:e},{:g})", dbx.Params{"id": security.RandomString(15), "h": hash(code), "a": actor, "c": now.Format(time.RFC3339), "e": now.Add(7 * 24 * time.Hour).Format(time.RFC3339), "g": groupID(id)})
	})
	return code, err
}
func (s *Service) Redeem(actor, code string) error {
	return s.App.RunInTransaction(func(app core.App) error {
		u, err := app.FindRecordById("users", actor)
		if err != nil {
			return fail(401, "다시 로그인해 주세요.")
		}
		if u.GetString("status") == "suspended" {
			return fail(403, "이용이 중지된 계정입니다.")
		}
		links, err := identityProviders(app, u)
		if err != nil {
			return err
		}
		if len(links) == 0 {
			return fail(403, "Google 또는 카카오 로그인을 먼저 완료해 주세요.")
		}
		rows := []Invitation{}
		if err = app.DB().NewQuery("SELECT id,created_by,created,expires,disabled,redeemed_by,redeemed_at,group_id FROM kokko_invitations WHERE hash={:h}").Bind(dbx.Params{"h": hash(strings.TrimSpace(code))}).All(&rows); err != nil {
			return err
		}
		if len(rows) != 1 {
			return fail(400, "사용할 수 없는 초대 코드입니다.")
		}
		v := rows[0]
		memberships := []struct {
			Status string `db:"status"`
		}{}
		if err = app.DB().NewQuery("SELECT status FROM kokko_group_members WHERE group_id={:g} AND player_id={:p}").Bind(dbx.Params{"g": v.GroupID, "p": actor}).All(&memberships); err != nil {
			return err
		}
		if len(memberships) > 0 && memberships[0].Status == "blocked" {
			return fail(403, "이 모임에 참여할 수 없습니다.")
		}
		if v.RedeemedBy == actor && u.GetString("status") == "active" && len(memberships) > 0 && memberships[0].Status == "active" {
			return nil
		}
		expires, err := time.Parse(time.RFC3339, v.Expires)
		if err != nil {
			return err
		}
		if v.Disabled || v.RedeemedBy != "" || !s.Now().Before(expires) {
			return fail(400, "만료되었거나 이미 사용된 초대 코드입니다.")
		}
		res, err := app.DB().NewQuery("UPDATE kokko_invitations SET redeemed_by={:a},redeemed_at={:t} WHERE id={:id} AND redeemed_by='' AND disabled=0").Bind(dbx.Params{"a": actor, "t": s.Now().UTC().Format(time.RFC3339), "id": v.ID}).Execute()
		if err != nil {
			return err
		}
		n, err := res.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return fail(409, "이미 사용된 초대 코드입니다.")
		}
		if u.GetString("status") != "active" {
			u.Set("status", "active")
			u.Set("role", "member")
			if err = app.Save(u); err != nil {
				return err
			}
		}
		name := strings.TrimSpace(u.GetString("name"))
		if name == "" {
			name = "새 회원"
		}
		if err = exec(app, "INSERT INTO kokko_profiles(id,nickname) VALUES({:id},{:n}) ON CONFLICT(id) DO NOTHING", dbx.Params{"id": actor, "n": name}); err != nil {
			return err
		}
		if err = exec(app, `INSERT INTO kokko_group_members(group_id,player_id,role,status)
 VALUES({:g},{:p},CASE WHEN NOT EXISTS(SELECT 1 FROM kokko_group_members WHERE group_id={:g} AND role='owner') THEN 'owner' ELSE 'member' END,'active')
 ON CONFLICT(group_id,player_id) DO UPDATE SET status='active'`, dbx.Params{"g": v.GroupID, "p": actor}); err != nil {
			return err
		}
		if err = bumpGroup(app, v.GroupID); err != nil {
			return err
		}
		return exec(app, "UPDATE kokko_meta SET revision=revision+1", nil)
	})
}
func (s *Service) Invitations(actor string) ([]Invitation, error) {
	return s.GroupInvitations(actor, LegacyGroup)
}
func (s *Service) GroupInvitations(actor, id string) ([]Invitation, error) {
	out := []Invitation{}
	err := s.App.RunInTransaction(func(app core.App) error {
		g, err := groupMember(app, actor, id)
		if err != nil {
			return err
		}
		if !moderator(g) {
			return fail(403, "모임 관리자만 초대를 확인할 수 있습니다.")
		}
		return app.DB().NewQuery("SELECT id,created_by,created,expires,disabled,redeemed_by,redeemed_at,group_id FROM kokko_invitations WHERE group_id={:g} ORDER BY created DESC").Bind(dbx.Params{"g": g.ID}).All(&out)
	})
	return out, err
}
func (s *Service) DisableInvitation(actor, id string) error {
	return s.DisableGroupInvitation(actor, LegacyGroup, id)
}
func (s *Service) DisableGroupInvitation(actor, group, id string) error {
	return s.App.RunInTransaction(func(app core.App) error {
		g, err := groupMember(app, actor, group)
		if err != nil {
			return err
		}
		if !moderator(g) {
			return fail(403, "모임 관리자만 초대를 중지할 수 있습니다.")
		}
		result, err := app.DB().NewQuery("UPDATE kokko_invitations SET disabled=1 WHERE id={:id} AND group_id={:g}").Bind(dbx.Params{"id": id, "g": g.ID}).Execute()
		if err != nil {
			return err
		}
		n, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if n != 1 {
			return fail(404, "초대를 찾을 수 없습니다.")
		}
		return nil
	})
}
func (s *Service) SetRole(id, role string) error {
	if role != "admin" && role != "member" {
		return errors.New("role must be admin or member")
	}
	return s.App.RunInTransaction(func(app core.App) error {
		u, err := member(app, id, false)
		if err != nil {
			return err
		}
		u.Set("role", role)
		return app.Save(u)
	})
}
func (s *Service) Suspend(id string) error {
	return s.App.RunInTransaction(func(app core.App) error {
		u, err := app.FindRecordById("users", id)
		if err != nil {
			return err
		}
		u.Set("status", "suspended")
		if err := app.Save(u); err != nil {
			return err
		}
		rules, err := readRankRules(app)
		if err != nil {
			return err
		}
		return refreshRanked(app, rules)
	})
}

// RenameMember is an offline server-operator action, not a member-facing API.
func (s *Service) RenameMember(id, nickname string) error {
	return s.App.RunInTransaction(func(app core.App) error {
		return renameMember(app, id, nickname)
	})
}

// RenameMemberAsAdmin checks current privileges inside the nickname transaction.
func (s *Service) RenameMemberAsAdmin(actor, id, nickname string) error {
	return s.RenameGroupMemberAsAdmin(actor, LegacyGroup, id, nickname)
}
func (s *Service) RenameGroupMemberAsAdmin(actor, group, id, nickname string) error {
	return s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, true); err != nil {
			return err
		}
		g, err := groupMember(app, actor, group)
		if err != nil {
			return err
		}
		var count struct {
			N int `db:"n"`
		}
		if err = app.DB().NewQuery(`SELECT COUNT(*) AS n FROM kokko_profiles p WHERE p.id={:p} AND
 (EXISTS(SELECT 1 FROM kokko_group_members gm WHERE gm.group_id={:g} AND gm.player_id=p.id AND gm.status='active')
 OR EXISTS(SELECT 1 FROM kokko_participants x JOIN kokko_matches m ON m.id=x.match_id WHERE x.player_id=p.id AND m.group_id={:g}))`).Bind(dbx.Params{"p": id, "g": g.ID}).One(&count); err != nil {
			return err
		}
		if count.N != 1 {
			return fail(404, "회원 프로필을 찾을 수 없습니다.")
		}
		return renameMember(app, id, nickname)
	})
}

func renameMember(app core.App, id, nickname string) error {
	nickname = strings.TrimSpace(nickname)
	if !utf8.ValidString(nickname) || utf8.RuneCountInString(nickname) < 1 || utf8.RuneCountInString(nickname) > 20 {
		return fail(400, "닉네임은 1~20자로 입력해 주세요.")
	}
	result, err := app.DB().NewQuery("UPDATE kokko_profiles SET nickname={:n} WHERE id={:id}").Bind(dbx.Params{"n": nickname, "id": id}).Execute()
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count != 1 {
		return fail(404, "회원 프로필을 찾을 수 없습니다.")
	}
	return profileChanged(app, id)
}

func ErrorMessage(err error) string {
	status, msg := problem(err)
	if status == 500 {
		return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."
	}
	return msg
}
