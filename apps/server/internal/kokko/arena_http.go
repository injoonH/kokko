package kokko

import (
	"encoding/base64"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

func pageNumber(e *core.RequestEvent) (int, error) {
	raw := e.Request.URL.Query().Get("page")
	if raw == "" {
		return 0, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 || n > 1000 {
		return 0, fail(400, "조회 범위를 확인해 주세요.")
	}
	return n, nil
}
func arenaActor(e *core.RequestEvent) string {
	if e.Auth != nil && e.Auth.Collection().Name == "users" {
		return e.Auth.Id
	}
	return ""
}
func (s *Service) RegisterArena(se *core.ServeEvent, limited func(string, *core.RequestEvent) bool) {
	pub := se.Router.Group("/api/kokko/arena")
	pub.GET("/state", func(e *core.RequestEvent) error {
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		q := e.Request.URL.Query()
		ids := []string{}
		if raw := q.Get("ids"); raw != "" {
			ids = strings.Split(raw, ",")
		}
		v, err := s.ArenaState(arenaActor(e), Filters{q.Get("kind"), q.Get("period"), q.Get("player"), q.Get("result")}, page, q.Get("at"), ids)
		return respond(e, v, err)
	})
	pub.GET("/leaderboard", func(e *core.RequestEvent) error {
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		kind := e.Request.URL.Query().Get("kind")
		if kind == "" {
			kind = "doubles"
		}
		friends := e.Request.URL.Query().Get("friends") == "true"
		switch e.Request.URL.Query().Get("view") {
		case "ranked":
			v, err := s.SeasonLeaderboard(arenaActor(e), kind, friends, page)
			return respond(e, v, err)
		case "", "elo":
			v, err := s.Leaderboard(arenaActor(e), kind, friends, page)
			return respond(e, v, err)
		default:
			return respond(e, nil, fail(400, "순위 기준을 확인해 주세요."))
		}
	})
	pub.GET("/players", func(e *core.RequestEvent) error {
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		if id := arenaActor(e); id != "" {
			if _, err := member(e.App, id, false); err != nil {
				return respond(e, nil, err)
			}
		}
		v, err := s.SearchPlayers(arenaActor(e), e.Request.URL.Query().Get("q"), page*20)
		more := len(v) > 20
		if more {
			v = v[:20]
		}
		return respond(e, map[string]any{"players": v, "hasMore": more}, err)
	})
	pub.GET("/players/{id}/avatar", func(e *core.RequestEvent) error {
		var p struct {
			Avatar string `db:"avatar"`
		}
		if err := e.App.DB().NewQuery("SELECT avatar FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": e.Request.PathValue("id")}).One(&p); err != nil || p.Avatar == "" {
			return e.NotFoundError("사진이 없습니다.", nil)
		}
		parts := strings.SplitN(p.Avatar, ",", 2)
		if len(parts) != 2 {
			return e.NotFoundError("사진이 없습니다.", nil)
		}
		mime := "image/jpeg"
		if strings.HasPrefix(parts[0], "data:image/png;") {
			mime = "image/png"
		}
		etag := `"` + hash(p.Avatar) + `"`
		e.Response.Header().Set("ETag", etag)
		e.Response.Header().Set("Cache-Control", "public, no-cache")
		if e.Request.Header.Get("If-None-Match") == etag {
			return e.NoContent(http.StatusNotModified)
		}
		data, err := base64.StdEncoding.DecodeString(parts[1])
		if err != nil {
			return e.NotFoundError("사진이 없습니다.", nil)
		}
		return e.Blob(200, mime, data)
	})
	pub.GET("/matches/{id}", func(e *core.RequestEvent) error {
		m, err := acceptedMatch(e.App, e.Request.PathValue("id"))
		if err != nil {
			return respond(e, nil, err)
		}
		id := arenaActor(e)
		admin := false
		if id != "" {
			u, err := member(e.App, id, false)
			if err != nil {
				return respond(e, nil, err)
			}
			admin = u.GetString("role") == "admin"
		}
		if m.Deleted && m.Author != id && !participant(m, id) && !admin {
			return e.NotFoundError("경기를 찾을 수 없습니다.", nil)
		}
		ids := append(append(slices.Clone(m.A), m.B...), m.Author)
		profiles, err := profilesByID(e.App, ids)
		if err != nil {
			return respond(e, nil, err)
		}
		ratings := []Rating{}
		if err := e.App.DB().NewQuery("SELECT * FROM kokko_rating_history WHERE match_id={:id} ORDER BY player_id").Bind(dbx.Params{"id": m.ID}).All(&ratings); err != nil {
			return respond(e, nil, err)
		}
		rankedGames, err := rankedMatchGames(e.App, []string{m.ID})
		if err != nil {
			return respond(e, nil, err)
		}
		versions := map[string]int{}
		if id != "" {
			versions, err = arenaDayVersions(e.App)
			if err != nil {
				return respond(e, nil, err)
			}
		}
		if !m.Deleted {
			orders, err := publicOrders(e.App, []string{m.ID})
			if err != nil {
				return respond(e, nil, err)
			}
			m.Order = orders[m.ID]
		}
		m.GroupID = ""
		return e.JSON(200, map[string]any{"match": m, "profiles": profiles, "ratings": ratings, "rankedGames": rankedGames, "days": versions})
	})
	private := pub.Group("")
	private.Bind(apis.RequireAuth("users"))
	private.GET("/day", func(e *core.RequestEvent) error {
		if _, err := member(e.App, actor(e), false); err != nil {
			return respond(e, nil, err)
		}
		date := e.Request.URL.Query().Get("date")
		d, err := time.Parse("2006-01-02", date)
		if err != nil || d.Format("2006-01-02") != date || date > Today(s.Now()) {
			return respond(e, nil, fail(400, "날짜를 확인해 주세요."))
		}
		ms, err := publicDay(e.App, date, "", 1001)
		if err != nil {
			return respond(e, nil, err)
		}
		truncated := len(ms) > 1000
		if truncated {
			ms = ms[:1000]
		}
		ids := map[string]bool{}
		for i := range ms {
			ms[i].GroupID = ""
			for _, id := range append(slices.Clone(ms[i].A), ms[i].B...) {
				ids[id] = true
			}
		}
		list := []string{}
		for id := range ids {
			list = append(list, id)
		}
		players, err := profilesByID(e.App, list)
		if err != nil {
			return respond(e, nil, err)
		}
		rows := []struct {
			N int `db:"version"`
		}{}
		if err := e.App.DB().NewQuery("SELECT version FROM kokko_arena_days WHERE played_on={:d}").Bind(dbx.Params{"d": date}).All(&rows); err != nil {
			return respond(e, nil, err)
		}
		version := 0
		if len(rows) > 0 {
			version = rows[0].N
		}
		return e.JSON(200, map[string]any{"matches": ms, "profiles": players, "version": version, "truncated": truncated})
	})
	private.GET("/social", func(e *core.RequestEvent) error {
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		v, err := s.Social(actor(e), SocialFilter{Page: page, Target: e.Request.URL.Query().Get("target")})
		return respond(e, v, err)
	})
	private.POST("/social/{id}", func(e *core.RequestEvent) error {
		if limited("social", e) {
			return respond(e, nil, fail(429, "요청이 많아요. 잠시 후 다시 시도해 주세요."))
		}
		var q struct {
			Action string `json:"action"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		return respond(e, map[string]bool{"ok": true}, s.Relate(actor(e), e.Request.PathValue("id"), q.Action))
	})
	recordMatch := func(e *core.RequestEvent) error {
		if limited("record", e) {
			return respond(e, nil, fail(429, "요청이 많아요. 잠시 후 다시 시도해 주세요."))
		}
		var q Mutation
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		m, err := s.RecordMatch(actor(e), q)
		m.GroupID = ""
		return respond(e, arenaReceipt{Match: m}, err)
	}
	private.POST("/matches", recordMatch)
	// A browser still on the previous build can resolve its original request ID.
	private.POST("/proposals", recordMatch)
	private.POST("/matches/{id}/reports", func(e *core.RequestEvent) error {
		if limited("report", e) {
			return respond(e, nil, fail(429, "신고가 많아요. 잠시 후 다시 시도해 주세요."))
		}
		var q struct {
			Reason string `json:"reason"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		q.Reason = strings.TrimSpace(q.Reason)
		if utf8.RuneCountInString(q.Reason) < 3 || utf8.RuneCountInString(q.Reason) > 300 {
			return respond(e, nil, fail(400, "신고 사유를 3~300자로 적어 주세요."))
		}
		err := e.App.RunInTransaction(func(app core.App) error {
			if _, err := member(app, actor(e), false); err != nil {
				return err
			}
			m, err := acceptedMatch(app, e.Request.PathValue("id"))
			if err != nil {
				return err
			}
			if m.Deleted {
				return fail(404, "경기를 찾을 수 없습니다.")
			}
			return exec(app, `INSERT INTO kokko_match_reports(id,match_id,actor,reason,created) VALUES({:id},{:m},{:a},{:r},{:t}) ON CONFLICT(match_id,actor) WHERE status='open' DO NOTHING`, dbx.Params{"id": security.RandomString(15), "m": m.ID, "a": actor(e), "r": q.Reason, "t": s.Now().UTC().Format(time.RFC3339Nano)})
		})
		return respond(e, map[string]bool{"ok": true}, err)
	})
	private.GET("/reports", func(e *core.RequestEvent) error {
		if _, err := member(e.App, actor(e), true); err != nil {
			return respond(e, nil, err)
		}
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		rows := []struct {
			ID      string `json:"id" db:"id"`
			MatchID string `json:"matchId" db:"match_id"`
			Actor   string `json:"actor" db:"actor"`
			Reason  string `json:"reason" db:"reason"`
			Created string `json:"created" db:"created"`
		}{}
		err = e.App.DB().NewQuery("SELECT id,match_id,actor,reason,created FROM kokko_match_reports WHERE status='open' ORDER BY created,id LIMIT 26 OFFSET {:offset}").Bind(dbx.Params{"offset": page * 25}).All(&rows)
		more := len(rows) > 25
		if more {
			rows = rows[:25]
		}
		voids := []struct {
			MatchID string `json:"matchId" db:"match_id"`
			Reason  string `json:"reason" db:"reason"`
			Version int    `json:"version" db:"version"`
		}{}
		if err == nil {
			err = e.App.DB().NewQuery("SELECT v.match_id,v.reason,CAST(json_extract(m.data,'$.version') AS INTEGER) AS version FROM kokko_voids v JOIN kokko_matches m ON m.id=v.match_id ORDER BY v.created DESC,v.match_id LIMIT 25 OFFSET {:offset}").Bind(dbx.Params{"offset": page * 25}).All(&voids)
		}
		return respond(e, map[string]any{"reports": rows, "voids": voids, "hasMore": more || len(voids) == 25}, err)
	})
	private.POST("/reports/{id}", func(e *core.RequestEvent) error {
		var q struct {
			Reason string `json:"reason"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		q.Reason = strings.TrimSpace(q.Reason)
		if utf8.RuneCountInString(q.Reason) < 3 || utf8.RuneCountInString(q.Reason) > 300 {
			return respond(e, nil, fail(400, "검토 사유를 3~300자로 적어 주세요."))
		}
		err := e.App.RunInTransaction(func(app core.App) error {
			if _, err := member(app, actor(e), true); err != nil {
				return err
			}
			return exec(app, "UPDATE kokko_match_reports SET status='resolved',resolved_by={:a},resolution={:r} WHERE id={:id} AND status='open'", dbx.Params{"id": e.Request.PathValue("id"), "a": actor(e), "r": q.Reason})
		})
		return respond(e, map[string]bool{"ok": true}, err)
	})
	private.GET("/deleted", func(e *core.RequestEvent) error {
		u, err := member(e.App, actor(e), false)
		if err != nil {
			return respond(e, nil, err)
		}
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		rows := []struct {
			Data string `db:"data"`
		}{}
		err = e.App.DB().NewQuery(`SELECT m.data FROM kokko_matches m WHERE json_extract(m.data,'$.deleted') AND ({:admin} OR EXISTS(SELECT 1 FROM kokko_participants p WHERE p.match_id=m.id AND p.player_id={:a})) ORDER BY m.played_on DESC,m.id DESC LIMIT 26 OFFSET {:offset}`).Bind(dbx.Params{"a": actor(e), "admin": u.GetString("role") == "admin", "offset": page * 25}).All(&rows)
		if err != nil {
			return respond(e, nil, err)
		}
		more := len(rows) > 25
		if more {
			rows = rows[:25]
		}
		ms := []Match{}
		ids := map[string]bool{}
		for _, r := range rows {
			var m Match
			if err := jsonDecode(r.Data, &m); err != nil {
				return respond(e, nil, err)
			}
			m.GroupID = ""
			ms = append(ms, m)
			for _, id := range append(slices.Clone(m.A), m.B...) {
				ids[id] = true
			}
		}
		list := []string{}
		for id := range ids {
			list = append(list, id)
		}
		ps, err := profilesByID(e.App, list)
		return respond(e, map[string]any{"matches": ms, "profiles": ps, "hasMore": more}, err)
	})
	private.POST("/matches/{id}/void", func(e *core.RequestEvent) error {
		var q struct {
			Reason  string `json:"reason"`
			Version int    `json:"version"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		return respond(e, map[string]bool{"ok": true}, s.Void(actor(e), e.Request.PathValue("id"), q.Reason, q.Version))
	})
	private.POST("/matches/{id}/reopen", func(e *core.RequestEvent) error {
		var q struct {
			Reason  string `json:"reason"`
			Version int    `json:"version"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		return respond(e, map[string]bool{"ok": true}, s.Reopen(actor(e), e.Request.PathValue("id"), q.Reason, q.Version))
	})
	private.GET("/admin/players", func(e *core.RequestEvent) error {
		if _, err := member(e.App, actor(e), true); err != nil {
			return respond(e, nil, err)
		}
		page, err := pageNumber(e)
		if err != nil {
			return respond(e, nil, err)
		}
		q := strings.TrimSpace(e.Request.URL.Query().Get("q"))
		if len(q) > 120 {
			return respond(e, nil, fail(400, "검색어를 확인해 주세요."))
		}
		players := []PublicPlayer{}
		err = e.App.DB().NewQuery("SELECT " + playerColumns + playerJoins + " WHERE p.nickname LIKE {:q} OR h.handle={:exact} ORDER BY p.nickname,p.id LIMIT 26 OFFSET {:offset}").Bind(dbx.Params{"q": "%" + q + "%", "exact": strings.TrimPrefix(q, "#"), "offset": page * 25}).All(&players)
		more := len(players) > 25
		if more {
			players = players[:25]
		}
		return respond(e, map[string]any{"players": players, "hasMore": more}, err)
	})
	private.PATCH("/players/{id}/nickname", func(e *core.RequestEvent) error {
		var q struct {
			Nickname string `json:"nickname"`
		}
		if err := body(e, &q); err != nil {
			return respond(e, nil, err)
		}
		err := e.App.RunInTransaction(func(app core.App) error {
			if _, err := member(app, actor(e), true); err != nil {
				return err
			}
			return renameMember(app, e.Request.PathValue("id"), q.Nickname)
		})
		return respond(e, map[string]bool{"ok": true}, err)
	})
}

// Only resolve ambiguous saves from the private-group app here.
func (s *Service) LegacyRetry(actor string, q Mutation) (map[string]any, error) {
	if _, err := member(s.App, actor, false); err != nil {
		return nil, err
	}
	rows := []struct {
		Hash   string `db:"hash"`
		Result string `db:"result"`
	}{}
	if err := s.App.DB().NewQuery("SELECT hash,result FROM kokko_requests WHERE actor={:a} AND request_id={:r}").Bind(dbx.Params{"a": actor, "r": q.RequestID}).All(&rows); err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, fail(410, "이전 저장 요청은 처리되지 않았어요. 입력한 점수는 유지했어요. 다시 저장할 수 있어요.")
	}
	if rows[0].Hash != hash(encode(q)) {
		return nil, fail(409, "이전 요청의 내용이 달라졌어요. 기록을 확인해 주세요.")
	}
	var m Match
	if err := jsonDecode(rows[0].Result, &m); err != nil {
		return nil, err
	}
	m.GroupID = ""
	return map[string]any{"legacy": true, "match": m}, nil
}
