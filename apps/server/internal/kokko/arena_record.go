package kokko

import (
	"database/sql"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

type arenaChange struct {
	actor, action, reservedSlot string
	before, match               Match
}

type arenaReceipt struct {
	Match Match `json:"match"`
	// Only receipts written by the approval flow have a proposal ID.
	ProposalID string `json:"id,omitempty"`
}

func (s *Service) RecordMatch(actor string, q Mutation) (Match, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out Match
	if len(q.RequestID) < 16 || len(q.RequestID) > 80 {
		return out, fail(400, "저장 요청 식별자를 확인해 주세요.")
	}
	params := dbx.Params{"a": actor, "r": q.RequestID, "h": hash(encode(q))}
	err := s.App.RunInTransaction(func(app core.App) error {
		if _, err := member(app, actor, false); err != nil {
			return err
		}
		var cached struct {
			Hash   string `db:"hash"`
			Result string `db:"result"`
		}
		err := app.DB().NewQuery("SELECT hash,result FROM kokko_arena_requests WHERE actor={:a} AND request_id={:r}").Bind(params).One(&cached)
		if err == nil {
			if cached.Hash != params["h"] {
				return fail(409, "같은 요청의 내용이 달라졌습니다.")
			}
			out, err = readArenaReceipt(app, actor, cached.Result)
			return err
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		now := s.Now()
		change, err := prepareArenaChange(app, actor, q, now)
		if err != nil {
			return err
		}
		out, err = applyArenaChange(app, change, now.UTC().Format(time.RFC3339Nano))
		if err != nil {
			return err
		}
		if err := replayArena(app, out.Kind); err != nil {
			return err
		}
		params["result"] = encode(arenaReceipt{Match: out})
		return exec(app, "INSERT INTO kokko_arena_requests VALUES({:a},{:r},{:h},{:result})", params)
	})
	return out, err
}

func readArenaReceipt(app core.App, actor, raw string) (Match, error) {
	var receipt arenaReceipt
	if err := jsonDecode(raw, &receipt); err != nil {
		return Match{}, err
	}
	if receipt.ProposalID == "" {
		return receipt.Match, nil
	}
	// The old receipt was cached when the request was submitted. Its proposal
	// holds the final outcome, including rejection and rollout application.
	var row struct {
		Status  string `db:"status"`
		Payload string `db:"payload"`
	}
	if err := app.DB().NewQuery("SELECT status,payload FROM kokko_proposals WHERE id={:id} AND actor={:a}").Bind(dbx.Params{"id": receipt.ProposalID, "a": actor}).One(&row); err != nil {
		return Match{}, err
	}
	if row.Status != "confirmed" {
		return Match{}, fail(410, "이전 저장 요청은 반영되지 않았어요. 경기 기록을 확인한 뒤 다시 저장할 수 있어요.")
	}
	var m Match
	err := jsonDecode(row.Payload, &m)
	return m, err
}

func prepareArenaChange(app core.App, actor string, q Mutation, now time.Time) (arenaChange, error) {
	change := arenaChange{actor: actor, action: q.Action}
	var m Match
	if q.Action == "create" {
		if q.ID != "" {
			return change, fail(400, "새 경기 ID를 지정할 수 없습니다.")
		}
		m = Match{ID: security.RandomString(15), Author: actor, Version: 1, Created: now.UTC().Format(time.RFC3339Nano), GroupID: LegacyGroup}
	} else {
		var err error
		m, err = acceptedMatch(app, q.ID)
		if err != nil {
			return change, err
		}
		if !participant(m, actor) {
			return change, fail(403, "본인이 참여한 경기만 변경할 수 있어요.")
		}
		if m.Version != q.Version {
			return change, fail(409, "경기가 변경됐어요. 최신 기록을 확인해 주세요.")
		}
		if m.Deleted && q.Action != "restore" {
			return change, fail(409, "삭제된 경기는 먼저 복구해 주세요.")
		}
		change.before = m
		m.Version++
	}
	switch q.Action {
	case "create", "edit":
		if q.Action == "edit" && (q.Kind != m.Kind || !slices.Equal(q.A, m.A) || !slices.Equal(q.B, m.B)) {
			return change, fail(400, "기록된 경기의 선수와 팀은 바꿀 수 없어요. 잘못된 대진은 신고해 주세요.")
		}
		m.Kind, m.Date, m.A, m.B = q.Kind, q.Date, q.A, q.B
		m.ScoreA, m.ScoreB = q.ScoreA, q.ScoreB
	case "move":
		if q.Position <= 0 {
			return change, fail(400, "변경할 경기 순서를 선택해 주세요.")
		}
	case "delete":
		m.Deleted = true
	case "restore":
		if !m.Deleted {
			return change, fail(409, "삭제되지 않은 경기입니다.")
		}
		var voided int
		if err := app.DB().NewQuery("SELECT COUNT(*) FROM kokko_voids WHERE match_id={:id}").Bind(dbx.Params{"id": m.ID}).Row(&voided); err != nil {
			return change, err
		}
		if voided > 0 {
			return change, fail(403, "관리자가 제외한 경기는 재검토 후 복구할 수 있어요.")
		}
		m.Deleted = false
	default:
		return change, fail(400, "변경 방법을 확인해 주세요.")
	}
	if err := Validate(m, now); err != nil {
		return change, err
	}
	if !participant(m, actor) {
		return change, fail(403, "본인이 참여한 경기만 기록할 수 있어요.")
	}
	if err := arenaLineup(app, m, q.Action != "create"); err != nil {
		return change, err
	}
	change.match = m
	if change.before.Date == m.Date && (q.Position == 0 || q.Action == "delete" || q.Action == "restore") {
		return change, nil
	}
	anchor := ""
	if q.Position < 0 {
		return change, fail(400, "경기 순서를 확인해 주세요.")
	}
	if q.Position > 0 {
		day, err := publicDay(app, m.Date, m.ID)
		if err != nil {
			return change, err
		}
		if q.Position > len(day)+1 {
			return change, fail(400, "경기 순서를 확인해 주세요.")
		}
		versions, err := arenaDayVersions(app)
		if err != nil {
			return change, err
		}
		if v, ok := q.DayVersions[m.Date]; !ok || v != versions[m.Date] {
			return change, fail(409, "경기 순서가 바뀌었어요. 새로고침해 주세요.")
		}
		if q.Position <= len(day) {
			anchor = day[q.Position-1].ID
		}
	}
	change.reservedSlot = m.ID
	if q.Action != "create" {
		change.reservedSlot = security.RandomString(15)
	}
	return change, reserveSlot(app, change.reservedSlot, m.Date, anchor)
}

func applyArenaChange(app core.App, change arenaChange, now string) (Match, error) {
	m := change.match
	if change.reservedSlot != "" && change.reservedSlot != m.ID {
		if err := exec(app, "DELETE FROM kokko_arena_slots WHERE id={:id}", dbx.Params{"id": m.ID}); err != nil {
			return m, err
		}
		if err := exec(app, "UPDATE kokko_arena_slots SET id={:id} WHERE id={:slot}", dbx.Params{"id": m.ID, "slot": change.reservedSlot}); err != nil {
			return m, err
		}
	}
	if err := app.DB().NewQuery("SELECT position FROM kokko_arena_slots WHERE id={:id} AND played_on={:d}").Bind(dbx.Params{"id": m.ID, "d": m.Date}).Row(&m.Order); err != nil {
		return m, err
	}
	m.Updated = now
	if err := saveMatch(app, m); err != nil {
		return m, err
	}
	if change.action == "create" {
		for _, team := range []struct {
			name    string
			players []string
		}{{"A", m.A}, {"B", m.B}} {
			for i, player := range team.players {
				if err := exec(app, "INSERT INTO kokko_participants VALUES({:m},{:p},{:t},{:s})", dbx.Params{"m": m.ID, "p": player, "t": team.name, "s": i}); err != nil {
					return m, err
				}
			}
		}
	}
	if err := exec(app, "INSERT INTO kokko_revisions VALUES({:id},{:m},{:a},{:action},{:now},{:before},{:after})", dbx.Params{"id": security.RandomString(15), "m": m.ID, "a": change.actor, "action": change.action, "now": now, "before": encode(change.before), "after": encode(m)}); err != nil {
		return m, err
	}
	if err := bumpArenaDay(app, m.Date); err != nil {
		return m, err
	}
	if change.before.Date != "" && change.before.Date != m.Date {
		if err := bumpArenaDay(app, change.before.Date); err != nil {
			return m, err
		}
	}
	return m, exec(app, "UPDATE kokko_meta SET revision=revision+1 WHERE id=1", nil)
}

func replayArena(app core.App, kinds ...string) error {
	if len(kinds) == 0 {
		return nil
	}
	if err := syncArenaOrder(app); err != nil {
		return err
	}
	matches, err := loadMatches(app)
	if err != nil {
		return err
	}
	for _, kind := range kinds {
		if err := rebuildRecorded(app, matches, kind); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) applyPendingMatches() (int, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var applied int
	err := s.App.RunInTransaction(func(app core.App) error {
		var pending []struct {
			ID          string `db:"id"`
			MatchID     string `db:"match_id"`
			Actor       string `db:"actor"`
			Action      string `db:"action"`
			BaseVersion int    `db:"base_version"`
			Payload     string `db:"payload"`
			Reserved    bool   `db:"reserved"`
		}
		if err := app.DB().NewQuery(`SELECT p.id,p.match_id,p.actor,p.action,p.base_version,p.payload,p.reserved
FROM kokko_proposals p LEFT JOIN kokko_arena_slots s ON s.id=CASE WHEN p.reserved THEN p.id ELSE p.match_id END
WHERE p.status='pending' ORDER BY s.played_on,s.position,p.created,p.id`).All(&pending); err != nil {
			return err
		}
		now := s.Now()
		resolved := now.UTC().Format(time.RFC3339Nano)
		var kinds []string
		for _, p := range pending {
			change := arenaChange{actor: p.Actor, action: p.Action}
			if err := jsonDecode(p.Payload, &change.match); err != nil {
				return err
			}
			if change.match.ID != p.MatchID || !participant(change.match, p.Actor) {
				return fmt.Errorf("invalid stored match request %s", p.ID)
			}
			if _, err := member(app, p.Actor, false); err != nil {
				return fmt.Errorf("pending match %s: %w", p.ID, err)
			}
			if err := Validate(change.match, now); err != nil {
				return fmt.Errorf("pending match %s: %w", p.ID, err)
			}
			if err := arenaLineup(app, change.match, p.Action != "create"); err != nil {
				return fmt.Errorf("pending match %s: %w", p.ID, err)
			}
			if p.Action != "create" {
				before, err := acceptedMatch(app, p.MatchID)
				if err != nil {
					return err
				}
				if before.Version != p.BaseVersion {
					return fmt.Errorf("pending match %s has a stale version", p.ID)
				}
				change.before = before
			}
			if p.Reserved {
				change.reservedSlot = p.ID
			}
			m, err := applyArenaChange(app, change, resolved)
			if err != nil {
				return fmt.Errorf("pending match %s: %w", p.ID, err)
			}
			if err := exec(app, "UPDATE kokko_proposals SET status='confirmed',confirmed_by='',resolved={:t},payload={:m} WHERE id={:id}", dbx.Params{"id": p.ID, "t": resolved, "m": encode(m)}); err != nil {
				return err
			}
			if !slices.Contains(kinds, m.Kind) {
				kinds = append(kinds, m.Kind)
			}
		}
		applied = len(pending)
		return replayArena(app, kinds...)
	})
	if err != nil {
		return 0, err
	}
	return applied, nil
}
