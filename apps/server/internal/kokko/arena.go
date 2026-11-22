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

type Proposal struct {
	ID          string `json:"id" db:"id"`
	MatchID     string `json:"matchId" db:"match_id"`
	Actor       string `json:"actor" db:"actor"`
	Action      string `json:"action" db:"action"`
	BaseVersion int    `json:"baseVersion" db:"base_version"`
	Version     int    `json:"version" db:"version"`
	Status      string `json:"status" db:"status"`
	Payload     string `json:"-" db:"payload"`
	Intent      string `json:"intent" db:"intent"`
	Reserved    bool   `json:"-" db:"reserved"`
	ConfirmedBy string `json:"confirmedBy" db:"confirmed_by"`
	Created     string `json:"created" db:"created"`
	Resolved    string `json:"resolved" db:"resolved"`
	Match       Match  `json:"match" db:"-"`
	Before      *Match `json:"before,omitempty" db:"-"`
}

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
func proposal(app core.App, id string) (Proposal, error) {
	var p Proposal
	err := app.DB().NewQuery("SELECT * FROM kokko_proposals WHERE id={:id}").Bind(dbx.Params{"id": id}).One(&p)
	if errors.Is(err, sql.ErrNoRows) {
		return p, fail(404, "확인 요청을 찾을 수 없습니다.")
	}
	if err != nil {
		return p, err
	}
	err = jsonDecode(p.Payload, &p.Match)
	return p, err
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

// Slots include private pending reservations. Public positions count accepted
// games only; a late confirmation still uses its original chronological slot.
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
	if err := exec(app, "INSERT INTO kokko_arena_slots VALUES({:id},{:d},{:p})", dbx.Params{"id": id, "d": date, "p": pos.N}); err != nil {
		return err
	}
	return bumpArenaDay(app, date)
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
func (s *Service) Submit(actor string, q Mutation) (Proposal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out Proposal
	if len(q.RequestID) < 16 || len(q.RequestID) > 80 {
		return out, fail(400, "저장 요청 식별자를 확인해 주세요.")
	}
	err := s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, false); err != nil {
			return err
		}
		var cached struct {
			Hash   string `db:"hash"`
			Result string `db:"result"`
		}
		err := app.DB().NewQuery("SELECT hash,result FROM kokko_arena_requests WHERE actor={:a} AND request_id={:r}").Bind(dbx.Params{"a": actor, "r": q.RequestID}).One(&cached)
		if err == nil {
			if cached.Hash != hash(encode(q)) {
				return fail(409, "같은 요청의 내용이 달라졌습니다.")
			}
			return jsonDecode(cached.Result, &out)
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		p := Proposal{ID: security.RandomString(15), Actor: actor, Action: q.Action, Status: "pending", Version: 1, Created: s.Now().UTC().Format(time.RFC3339Nano)}
		m := Match{}
		if q.Action == "create" {
			if q.ID != "" {
				return fail(400, "새 경기 ID를 지정할 수 없습니다.")
			}
			m = Match{ID: p.ID, Author: actor, Version: 1, Created: p.Created, GroupID: LegacyGroup}
		} else {
			m, err = acceptedMatch(app, q.ID)
			if err != nil {
				return err
			}
			if !participant(m, actor) {
				return fail(403, "본인이 참여한 경기만 변경을 요청할 수 있어요.")
			}
			if m.Version != q.Version {
				return fail(409, "경기가 변경됐어요. 최신 기록을 확인해 주세요.")
			}
			p.BaseVersion = m.Version
			if m.Deleted && q.Action != "restore" {
				return fail(409, "삭제된 경기는 복구 요청을 해 주세요.")
			}
			if !m.Deleted && q.Action == "restore" {
				return fail(409, "삭제되지 않은 경기입니다.")
			}
			if q.Action == "restore" {
				var n struct {
					N int `db:"n"`
				}
				if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_voids WHERE match_id={:id}").Bind(dbx.Params{"id": m.ID}).One(&n); err != nil {
					return err
				}
				if n.N > 0 {
					return fail(403, "관리자가 제외한 경기는 재검토 후 복구를 요청할 수 있어요.")
				}
			}
			if q.Action != "edit" && q.Action != "move" && q.Action != "delete" && q.Action != "restore" {
				return fail(400, "변경 요청을 확인해 주세요.")
			}
			m.Version++
		}
		old := m
		if q.Action == "create" || q.Action == "edit" {
			if q.Action == "edit" && (q.Kind != m.Kind || encode(q.A) != encode(m.A) || encode(q.B) != encode(m.B)) {
				return fail(400, "확인된 경기의 선수와 팀은 바꿀 수 없어요. 잘못된 대진은 신고해 주세요.")
			}
			m.Kind = q.Kind
			m.Date = q.Date
			m.A = q.A
			m.B = q.B
			m.ScoreA = q.ScoreA
			m.ScoreB = q.ScoreB
		}
		if q.Action == "move" && q.Position <= 0 {
			return fail(400, "변경할 경기 순서를 선택해 주세요.")
		}
		if q.Action == "delete" {
			m.Deleted = true
		}
		if q.Action == "restore" {
			m.Deleted = false
		}
		if err := Validate(m, s.Now()); err != nil {
			return err
		}
		if !participant(m, actor) {
			return fail(403, "본인이 참여한 경기만 기록할 수 있어요.")
		}
		if err := arenaLineup(app, m, q.Action != "create"); err != nil {
			return err
		}
		p.MatchID = m.ID
		var count struct {
			N int `db:"n"`
		}
		if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_proposals WHERE match_id={:id} AND status='pending'").Bind(dbx.Params{"id": m.ID}).One(&count); err != nil {
			return err
		}
		if count.N > 0 {
			return fail(409, "이미 확인을 기다리는 변경 요청이 있어요.")
		}
		day, err := publicDay(app, m.Date, m.ID)
		if err != nil {
			return err
		}
		keep := q.Action != "create" && old.Date == m.Date && (q.Position == 0 || q.Action == "delete" || q.Action == "restore")
		p.Intent = "기존 순서 유지"
		if !keep {
			p.Intent = "제출 시점의 마지막 순서로 예약"
			if q.Position > 0 {
				p.Intent = fmt.Sprintf("제출 시점의 %d번째 순서로 예약", q.Position)
			}
			anchor := ""
			if q.Position < 0 || q.Position > len(day)+1 {
				return fail(400, "경기 순서를 확인해 주세요.")
			}
			if q.Position > 0 {
				versions, err := arenaDayVersions(app)
				if err != nil {
					return err
				}
				if v, ok := q.DayVersions[m.Date]; !ok || v != versions[m.Date] {
					return fail(409, "경기 순서가 바뀌었어요. 새로고침해 주세요.")
				}
				if q.Position <= len(day) {
					anchor = day[q.Position-1].ID
				}
			}
			if err := reserveSlot(app, p.ID, m.Date, anchor); err != nil {
				return err
			}
			p.Reserved = true
		}
		m.Updated = p.Created
		p.Match = m
		p.Payload = encode(m)
		if err := exec(app, `INSERT INTO kokko_proposals(id,match_id,actor,action,base_version,version,status,payload,intent,reserved,created) VALUES({:id},{:m},{:a},{:action},{:base},1,'pending',{:payload},{:intent},{:reserved},{:created})`, dbx.Params{"id": p.ID, "m": p.MatchID, "a": actor, "action": p.Action, "base": p.BaseVersion, "payload": p.Payload, "intent": p.Intent, "reserved": p.Reserved, "created": p.Created}); err != nil {
			return err
		}
		out = p
		return exec(app, "INSERT INTO kokko_arena_requests VALUES({:a},{:r},{:h},{:result})", dbx.Params{"a": actor, "r": q.RequestID, "h": hash(encode(q)), "result": encode(out)})
	})
	return out, err
}

func (s *Service) Decide(actor, id, decision string, version int) (Proposal, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out Proposal
	err := s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, false); err != nil {
			return err
		}
		p, err := proposal(app, id)
		if err != nil {
			return err
		}
		if version != p.Version {
			return fail(409, "확인 요청이 바뀌었어요. 최신 내용을 확인해 주세요.")
		}
		if decision != "confirm" && decision != "reject" && decision != "cancel" {
			return fail(400, "확인 방법을 선택해 주세요.")
		}
		m := p.Match
		if decision == "cancel" {
			if p.Actor != actor {
				return fail(403, "작성자만 요청을 취소할 수 있어요.")
			}
		} else {
			if !participant(m, actor) || slices.Contains(m.A, actor) == slices.Contains(m.A, p.Actor) {
				return fail(403, "상대 팀 선수 한 명이 확인해야 해요.")
			}
		}
		if p.Status != "pending" {
			if (p.Status == "confirmed" && decision == "confirm" && p.ConfirmedBy == actor) || (p.Status == "cancelled" && decision == "cancel" && p.Actor == actor) || (p.Status == "rejected" && decision == "reject" && p.ConfirmedBy == actor) {
				out = p
				return nil
			}
			return fail(409, "이미 처리된 요청입니다.")
		}
		if decision == "confirm" {
			if _, err := member(app, p.Actor, false); err != nil {
				return fail(403, "요청한 회원의 이용 상태가 바뀌었어요.")
			}
			if err := arenaLineup(app, m, p.Action != "create"); err != nil {
				return err
			}
			var old Match
			if p.Action != "create" {
				old, err = acceptedMatch(app, p.MatchID)
				if err != nil {
					return err
				}
				if old.Version != p.BaseVersion {
					return fail(409, "원래 경기가 변경됐어요. 요청을 취소하고 다시 작성해 주세요.")
				}
			}
			if p.Reserved && p.ID != m.ID {
				if err := exec(app, "DELETE FROM kokko_arena_slots WHERE id={:id}", dbx.Params{"id": m.ID}); err != nil {
					return err
				}
				if err := exec(app, "UPDATE kokko_arena_slots SET id={:id} WHERE id={:p}", dbx.Params{"id": m.ID, "p": p.ID}); err != nil {
					return err
				}
			}
			var slot struct {
				Position int `db:"position"`
			}
			if err := app.DB().NewQuery("SELECT position FROM kokko_arena_slots WHERE id={:id}").Bind(dbx.Params{"id": m.ID}).One(&slot); err != nil {
				return err
			}
			m.Order = slot.Position
			m.Updated = s.Now().UTC().Format(time.RFC3339Nano)
			if err := saveMatch(app, m); err != nil {
				return err
			}
			if p.Action == "create" {
				for side, ps := range [][]string{m.A, m.B} {
					for i, player := range ps {
						team := "A"
						if side == 1 {
							team = "B"
						}
						if err := exec(app, "INSERT INTO kokko_participants VALUES({:m},{:p},{:t},{:s})", dbx.Params{"m": m.ID, "p": player, "t": team, "s": i}); err != nil {
							return err
						}
					}
				}
			}
			// Copy reserved positions to accepted records without changing their
			// relative order. Pending reservations themselves never enter Replay.
			if err := syncArenaOrder(app); err != nil {
				return err
			}
			ms, err := loadMatches(app)
			if err != nil {
				return err
			}
			if err := rebuildConfirmed(app, ms, m.Kind); err != nil {
				return err
			}
			if err := exec(app, "INSERT INTO kokko_revisions VALUES({:id},{:m},{:a},{:action},{:now},{:before},{:after})", dbx.Params{"id": security.RandomString(15), "m": m.ID, "a": p.Actor, "action": p.Action, "now": m.Updated, "before": encode(old), "after": encode(m)}); err != nil {
				return err
			}
			if err := exec(app, "UPDATE kokko_meta SET revision=revision+1 WHERE id=1", nil); err != nil {
				return err
			}
			if err := bumpArenaDay(app, m.Date); err != nil {
				return err
			}
			if old.Date != "" && old.Date != m.Date {
				if err := bumpArenaDay(app, old.Date); err != nil {
					return err
				}
			}
			p.Status = "confirmed"
			p.ConfirmedBy = actor
			p.Match = m
			p.Payload = encode(m)
		} else {
			p.Status = "rejected"
			p.ConfirmedBy = actor
			if decision == "cancel" {
				p.Status = "cancelled"
				p.ConfirmedBy = ""
			}
			if p.Reserved {
				if err := exec(app, "DELETE FROM kokko_arena_slots WHERE id={:id}", dbx.Params{"id": p.ID}); err != nil {
					return err
				}
				if err := bumpArenaDay(app, m.Date); err != nil {
					return err
				}
			}
		}
		p.Resolved = s.Now().UTC().Format(time.RFC3339Nano)
		if err := exec(app, "UPDATE kokko_proposals SET status={:s},confirmed_by={:a},resolved={:r},payload={:p} WHERE id={:id}", dbx.Params{"s": p.Status, "a": p.ConfirmedBy, "r": p.Resolved, "p": p.Payload, "id": p.ID}); err != nil {
			return err
		}
		out = p
		return nil
	})
	return out, err
}
func syncArenaOrder(app core.App) error {
	rows := []struct {
		ID       string `db:"id"`
		Date     string `db:"played_on"`
		Position int    `db:"position"`
	}{}
	if err := app.DB().NewQuery("SELECT s.* FROM kokko_arena_slots s JOIN kokko_matches m ON m.id=s.id").All(&rows); err != nil {
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
		pending := []Proposal{}
		if err := app.DB().NewQuery("SELECT * FROM kokko_proposals WHERE match_id={:id} AND status='pending'").Bind(dbx.Params{"id": id}).All(&pending); err != nil {
			return err
		}
		for _, p := range pending {
			if p.Reserved {
				var proposed Match
				if err := jsonDecode(p.Payload, &proposed); err != nil {
					return err
				}
				if err := exec(app, "DELETE FROM kokko_arena_slots WHERE id={:id}", dbx.Params{"id": p.ID}); err != nil {
					return err
				}
				if err := bumpArenaDay(app, proposed.Date); err != nil {
					return err
				}
			}
		}
		if err := exec(app, "UPDATE kokko_proposals SET status='superseded',resolved={:now},confirmed_by={:actor} WHERE match_id={:id} AND status='pending'", dbx.Params{"id": id, "actor": actor, "now": s.Now().UTC().Format(time.RFC3339Nano)}); err != nil {
			return err
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
		if err := rebuildConfirmed(app, ms, m.Kind); err != nil {
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
		return exec(app, "INSERT INTO kokko_match_reports VALUES({:id},{:m},{:a},{:r},'resolved',{:t},{:a},{:r})", dbx.Params{"id": security.RandomString(15), "m": id, "a": actor, "r": "재검토 후 복구 요청 허용: " + reason, "t": s.Now().UTC().Format(time.RFC3339Nano)})
	})
}
