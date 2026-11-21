package kokko

import (
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type PublicPlayer struct {
	Profile
	Friend bool `json:"friend" db:"friend"`
}

const playerColumns = `p.id,p.nickname,CASE WHEN p.avatar='' THEN '' ELSE '/api/kokko/arena/players/'||p.id||'/avatar' END AS avatar,u.status,COALESCE(h.handle,'') AS handle`
const playerJoins = ` FROM kokko_profiles p JOIN users u ON u.id=p.id LEFT JOIN kokko_player_handles h ON h.player_id=p.id `

func blocked(app core.App, a, b string) (bool, error) {
	var n struct {
		N int `db:"n"`
	}
	err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_blocks WHERE (actor={:a} AND target={:b}) OR (actor={:b} AND target={:a})").Bind(dbx.Params{"a": a, "b": b}).One(&n)
	return n.N > 0, err
}

type Social struct {
	Friends  []PublicPlayer `json:"friends"`
	Incoming []PublicPlayer `json:"incoming"`
	Outgoing []PublicPlayer `json:"outgoing"`
	Blocked  []PublicPlayer `json:"blocked"`
	HasMore  bool           `json:"hasMore"`
}

type SocialFilter struct {
	Page   int
	Target string
}

func (s *Service) Social(actor string, options ...SocialFilter) (Social, error) {
	opt := SocialFilter{}
	if len(options) > 0 {
		opt = options[0]
	}
	if opt.Page < 0 || opt.Page > 1000 || len(opt.Target) > 80 {
		return Social{}, fail(400, "조회 범위를 확인해 주세요.")
	}
	out := Social{}
	err := s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, false); err != nil {
			return err
		}
		for _, list := range []struct {
			dest  *[]PublicPlayer
			where string
		}{
			{&out.Friends, `u.status='active' AND EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='friends' AND ((f.a={:a} AND f.b=p.id) OR (f.b={:a} AND f.a=p.id)))`},
			{&out.Incoming, `u.status='active' AND EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='pending' AND f.requested_by!= {:a} AND ((f.a={:a} AND f.b=p.id) OR (f.b={:a} AND f.a=p.id)))`},
			{&out.Outgoing, `u.status='active' AND EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='pending' AND f.requested_by={:a} AND ((f.a={:a} AND f.b=p.id) OR (f.b={:a} AND f.a=p.id)))`},
			{&out.Blocked, `EXISTS(SELECT 1 FROM kokko_blocks b WHERE b.actor={:a} AND b.target=p.id)`},
		} {
			params := dbx.Params{"a": actor, "offset": opt.Page * 25, "target": opt.Target}
			players := []PublicPlayer{}
			where := list.where
			if opt.Target != "" {
				where += " AND p.id={:target}"
			}
			err := app.DB().NewQuery("SELECT " + playerColumns + playerJoins + " WHERE " + where + " ORDER BY p.nickname,p.id LIMIT 26 OFFSET {:offset}").Bind(params).All(&players)
			if err != nil {
				return err
			}
			if len(players) > 25 {
				out.HasMore = true
				players = players[:25]
			}
			*list.dest = players
		}
		return nil
	})
	return out, err
}
func (s *Service) Relate(actor, target, action string) error {
	if actor == target || target == "" {
		return fail(400, "다른 선수를 선택해 주세요.")
	}
	return s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, false); err != nil {
			return err
		}
		var n struct {
			N int `db:"n"`
		}
		if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": target}).One(&n); err != nil {
			return err
		}
		if n.N != 1 {
			return fail(404, "선수를 찾을 수 없습니다.")
		}
		a, b := actor, target
		if a > b {
			a, b = b, a
		}
		params := dbx.Params{"a": a, "b": b, "actor": actor, "target": target}
		switch action {
		case "block":
			if err := exec(app, "INSERT INTO kokko_blocks VALUES({:actor},{:target}) ON CONFLICT DO NOTHING", params); err != nil {
				return err
			}
			return exec(app, "DELETE FROM kokko_friendships WHERE a={:a} AND b={:b}", params)
		case "unblock":
			return exec(app, "DELETE FROM kokko_blocks WHERE actor={:actor} AND target={:target}", params)
		case "remove", "decline":
			return exec(app, "DELETE FROM kokko_friendships WHERE a={:a} AND b={:b}", params)
		case "request", "accept":
			if _, err := member(app, target, false); err != nil {
				return fail(404, "선수를 찾을 수 없습니다.")
			}
			if yes, err := blocked(app, actor, target); err != nil {
				return err
			} else if yes {
				return fail(404, "친구 요청을 보낼 수 없는 선수입니다.")
			}
			rows := []struct {
				By     string `db:"requested_by"`
				Status string `db:"status"`
			}{}
			if err := app.DB().NewQuery("SELECT requested_by,status FROM kokko_friendships WHERE a={:a} AND b={:b}").Bind(params).All(&rows); err != nil {
				return err
			}
			if len(rows) > 0 && rows[0].Status == "friends" {
				return nil
			}
			if action == "accept" {
				if len(rows) != 1 || rows[0].By == actor {
					return fail(409, "받은 친구 요청이 없어요.")
				}
				return exec(app, "UPDATE kokko_friendships SET status='friends',version=version+1 WHERE a={:a} AND b={:b}", params)
			}
			if len(rows) > 0 {
				if rows[0].By == actor {
					return nil
				}
				return fail(409, "이미 받은 친구 요청이 있어요. 수락해 주세요.")
			}
			return exec(app, "INSERT INTO kokko_friendships(a,b,requested_by,status) VALUES({:a},{:b},{:actor},'pending')", params)
		default:
			return fail(400, "친구 요청을 확인해 주세요.")
		}
	})
}
func (s *Service) SearchPlayers(actor, query string, offset int) ([]PublicPlayer, error) {
	if len(query) > 120 || offset < 0 || offset > 10000 {
		return nil, fail(400, "검색 조건을 확인해 주세요.")
	}
	query = strings.TrimSpace(strings.TrimPrefix(query, "#"))
	if i := strings.LastIndex(query, "#"); i >= 0 && len(query)-i-1 == 6 {
		query = query[i+1:]
	}
	pattern := "%" + strings.NewReplacer("!", "!!", "%", "!%", "_", "!_").Replace(query) + "%"
	out := []PublicPlayer{}
	err := s.App.DB().NewQuery(`SELECT ` + playerColumns + `,EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='friends' AND ((f.a={:a} AND f.b=p.id) OR (f.b={:a} AND f.a=p.id))) AS friend` + playerJoins + ` WHERE u.status='active' AND (p.nickname LIKE {:q} ESCAPE '!' OR h.handle LIKE {:q} ESCAPE '!' OR p.id={:exact}) AND NOT EXISTS(SELECT 1 FROM kokko_blocks b WHERE (b.actor={:a} AND b.target=p.id) OR (b.target={:a} AND b.actor=p.id)) ORDER BY friend DESC,p.nickname,p.id LIMIT 21 OFFSET {:offset}`).Bind(dbx.Params{"a": actor, "q": pattern, "exact": query, "offset": offset}).All(&out)
	return out, err
}
