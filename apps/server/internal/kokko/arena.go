package kokko

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

func jsonDecode(raw string, target any) error { return json.Unmarshal([]byte(raw), target) }
func ensureHandle(app core.App, id string) error {
	var n struct {
		N int `db:"n"`
	}
	if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_player_handles WHERE player_id={:id}").Bind(dbx.Params{"id": id}).One(&n); err != nil || n.N > 0 {
		return err
	}
	for {
		h := strings.ToLower(security.RandomString(6))
		if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_player_handles WHERE handle={:h}").Bind(dbx.Params{"h": h}).One(&n); err != nil {
			return err
		}
		if n.N > 0 {
			continue
		}
		return exec(app, "INSERT INTO kokko_player_handles VALUES({:id},{:h})", dbx.Params{"id": id, "h": h})
	}
}
func acceptedMatch(app core.App, id string) (Match, error) {
	var r struct {
		Data string `db:"data"`
	}
	if err := app.DB().NewQuery("SELECT data FROM kokko_matches WHERE id={:id}").Bind(dbx.Params{"id": id}).One(&r); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Match{}, fail(404, "경기를 찾을 수 없습니다.")
		}
		return Match{}, err
	}
	var m Match
	if err := jsonDecode(r.Data, &m); err != nil {
		return m, err
	}
	m.GroupID = groupID(m.GroupID)
	return m, nil
}
func arenaDayVersions(app core.App) (map[string]int, error) {
	rows := []struct {
		Date    string `db:"played_on"`
		Version int    `db:"version"`
	}{}
	err := app.DB().NewQuery("SELECT played_on,version FROM kokko_arena_days").All(&rows)
	out := map[string]int{}
	for _, r := range rows {
		out[r.Date] = r.Version
	}
	return out, err
}
func bumpArenaDay(app core.App, date string) error {
	return exec(app, "INSERT INTO kokko_arena_days VALUES({:d},1) ON CONFLICT(played_on) DO UPDATE SET version=version+1", dbx.Params{"d": date})
}
func arenaLineup(app core.App, m Match, historical bool) error {
	players := append(slices.Clone(m.A), m.B...)
	for _, id := range players {
		if _, err := member(app, id, false); err != nil && !historical {
			return fail(400, "활동 중인 선수를 선택해 주세요.")
		}
		var n struct {
			N int `db:"n"`
		}
		if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": id}).One(&n); err != nil {
			return err
		}
		if n.N != 1 {
			return fail(400, "선수 프로필을 찾을 수 없습니다.")
		}
	}
	for i, a := range players {
		for _, b := range players[i+1:] {
			var n struct {
				N int `db:"n"`
			}
			if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_blocks WHERE (actor={:a} AND target={:b}) OR (actor={:b} AND target={:a})").Bind(dbx.Params{"a": a, "b": b}).One(&n); err != nil {
				return err
			}
			if n.N > 0 {
				return fail(400, "함께 경기할 수 없는 선수가 포함되어 있어요.")
			}
		}
	}
	return nil
}

// Keep canonical positions stable when inserting before a saved game.
func reserveSlot(app core.App, id, date, anchor string) error {
	var pos struct {
		N int `db:"n"`
	}
	if anchor != "" {
		if err := app.DB().NewQuery("SELECT position AS n FROM kokko_arena_slots WHERE id={:a} AND played_on={:d}").Bind(dbx.Params{"a": anchor, "d": date}).One(&pos); err != nil {
			return fail(409, "경기 순서가 바뀌었어요. 최신 기록에서 다시 선택해 주세요.")
		}
		if err := exec(app, "UPDATE kokko_arena_slots SET position=position+1 WHERE played_on={:d} AND position>={:p}", dbx.Params{"d": date, "p": pos.N}); err != nil {
			return err
		}
	} else {
		if err := app.DB().NewQuery("SELECT COALESCE(MAX(position),0)+1 AS n FROM kokko_arena_slots WHERE played_on={:d}").Bind(dbx.Params{"d": date}).One(&pos); err != nil {
			return err
		}
	}
	return exec(app, "INSERT INTO kokko_arena_slots VALUES({:id},{:d},{:p})", dbx.Params{"id": id, "d": date, "p": pos.N})
}
func publicDay(app core.App, date, exclude string, capRows ...int) ([]Match, error) {
	rows := []struct {
		Data string `db:"data"`
	}{}
	limit := ""
	if len(capRows) > 0 {
		limit = " LIMIT " + fmt.Sprint(capRows[0])
	}
	err := app.DB().NewQuery(`SELECT m.data FROM kokko_matches m JOIN kokko_arena_slots s ON s.id=m.id WHERE m.played_on={:d} AND m.id!={:x} AND NOT json_extract(m.data,'$.deleted') ORDER BY s.position,m.id` + limit).Bind(dbx.Params{"d": date, "x": exclude}).All(&rows)
	ms := []Match{}
	for _, row := range rows {
		var m Match
		if err := jsonDecode(row.Data, &m); err != nil {
			return nil, err
		}
		m.Order = len(ms) + 1
		ms = append(ms, m)
	}
	return ms, err
}
func syncArenaOrder(app core.App) error {
	rows := []struct {
		ID       string `db:"id"`
		Date     string `db:"played_on"`
		Position int    `db:"position"`
	}{}
	if err := app.DB().NewQuery("SELECT s.* FROM kokko_arena_slots s JOIN kokko_matches m ON m.id=s.id WHERE s.played_on!=m.played_on OR s.position!=m.day_order").All(&rows); err != nil {
		return err
	}
	for _, r := range rows {
		if err := exec(app, "UPDATE kokko_matches SET played_on={:d},day_order={:p},data=json_set(data,'$.date',{:d},'$.order',{:p}) WHERE id={:id}", dbx.Params{"d": r.Date, "p": r.Position, "id": r.ID}); err != nil {
			return err
		}
	}
	return nil
}
func (s *Service) Void(actor, id, reason string, version int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 3 || utf8.RuneCountInString(reason) > 300 {
		return fail(400, "조치 사유를 3~300자로 적어 주세요.")
	}
	return s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, true); err != nil {
			return err
		}
		m, err := acceptedMatch(app, id)
		if err != nil {
			return err
		}
		if m.Version != version {
			return fail(409, "경기가 변경됐어요. 새로고침해 주세요.")
		}
		if m.Deleted {
			return fail(409, "이미 제외된 경기입니다.")
		}
		before := m
		m.Deleted = true
		m.Version++
		m.Updated = s.Now().UTC().Format(time.RFC3339Nano)
		if err := saveMatch(app, m); err != nil {
			return err
		}
		if err := exec(app, "INSERT INTO kokko_voids VALUES({:m},{:a},{:r},{:t}) ON CONFLICT(match_id) DO UPDATE SET actor=excluded.actor,reason=excluded.reason,created=excluded.created", dbx.Params{"m": id, "a": actor, "r": reason, "t": m.Updated}); err != nil {
			return err
		}
		ms, err := loadMatches(app)
		if err != nil {
			return err
		}
		if err := rebuildRecorded(app, ms, m.Kind); err != nil {
			return err
		}
		if err := exec(app, "INSERT INTO kokko_revisions VALUES({:id},{:m},{:a},'delete',{:now},{:b},{:v})", dbx.Params{"id": security.RandomString(15), "m": id, "a": actor, "now": m.Updated, "b": encode(before), "v": encode(m)}); err != nil {
			return err
		}
		if err := exec(app, "UPDATE kokko_match_reports SET status='resolved',resolved_by={:a},resolution={:r} WHERE match_id={:id} AND status='open'", dbx.Params{"a": actor, "r": reason, "id": id}); err != nil {
			return err
		}
		// Preserve a moderation reason even if the action originated outside a report.
		if err := exec(app, "INSERT INTO kokko_match_reports VALUES({:id},{:m},{:a},{:r},'resolved',{:t},{:a},{:r})", dbx.Params{"id": security.RandomString(15), "m": id, "a": actor, "r": reason, "t": m.Updated}); err != nil {
			return err
		}
		if err := bumpArenaDay(app, m.Date); err != nil {
			return err
		}
		return exec(app, "UPDATE kokko_meta SET revision=revision+1", nil)
	})
}

func (s *Service) Reopen(actor, id, reason string, version int) error {
	reason = strings.TrimSpace(reason)
	if utf8.RuneCountInString(reason) < 3 || utf8.RuneCountInString(reason) > 300 {
		return fail(400, "재검토 사유를 3~300자로 적어 주세요.")
	}
	return s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, true); err != nil {
			return err
		}
		m, err := acceptedMatch(app, id)
		if err != nil {
			return err
		}
		if m.Version != version || !m.Deleted {
			return fail(409, "경기 상태가 변경됐어요.")
		}
		var n struct {
			N int `db:"n"`
		}
		if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_voids WHERE match_id={:m}").Bind(dbx.Params{"m": id}).One(&n); err != nil {
			return err
		}
		if n.N == 0 {
			return nil
		}
		if err := exec(app, "DELETE FROM kokko_voids WHERE match_id={:m}", dbx.Params{"m": id}); err != nil {
			return err
		}
		return exec(app, "INSERT INTO kokko_match_reports VALUES({:id},{:m},{:a},{:r},'resolved',{:t},{:a},{:r})", dbx.Params{"id": security.RandomString(15), "m": id, "a": actor, "r": "재검토 후 복구 허용: " + reason, "t": s.Now().UTC().Format(time.RFC3339Nano)})
	})
}
