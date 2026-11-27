package kokko

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func ratingFingerprint(t *testing.T, app core.App) string {
	t.Helper()
	tables := []string{"kokko_matches", "kokko_participants", "kokko_ratings", "kokko_rating_history", "kokko_meta"}
	out := []any{}
	for _, table := range tables {
		rows := []dbx.NullStringMap{}
		if err := app.DB().NewQuery("SELECT * FROM " + table + " ORDER BY rowid").All(&rows); err != nil {
			t.Fatal(err)
		}
		out = append(out, rows)
	}
	return encode(out)
}
func mustRecord(t *testing.T, s *Service, actor string, q Mutation) Match {
	t.Helper()
	m, err := s.RecordMatch(actor, q)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

// Simulate a row and receipt from the former approval workflow.
func stagePending(t *testing.T, s *Service, actor string, q Mutation) Match {
	t.Helper()
	var m Match
	if err := s.App.RunInTransaction(func(app core.App) error {
		change, err := prepareArenaChange(app, actor, q, s.Now())
		if err != nil {
			return err
		}
		m = change.match
		id := change.reservedSlot
		if id == "" {
			id = q.RequestID
		}
		if err := exec(app, `INSERT INTO kokko_proposals(id,match_id,actor,action,base_version,payload,reserved,created)
VALUES({:id},{:m},{:a},{:action},{:base},{:payload},{:reserved},{:created})`, dbx.Params{
			"id": id, "m": m.ID, "a": actor, "action": q.Action, "base": q.Version,
			"payload": encode(m), "reserved": change.reservedSlot != "", "created": m.Created,
		}); err != nil {
			return err
		}
		return exec(app, "INSERT INTO kokko_arena_requests VALUES({:a},{:r},{:h},{:v})", dbx.Params{
			"a": actor, "r": q.RequestID, "h": hash(encode(q)), "v": encode(arenaReceipt{Match: m, ProposalID: id}),
		})
	}); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestArenaRecordsAndRetriesImmediately(t *testing.T) {
	s, ids := setup(t)
	if err := s.SetGroupMember(LegacyGroup, ids[0], "left"); err != nil {
		t.Fatal(err)
	}
	q := create(ids)
	m := mustRecord(t, s, ids[0], q)
	if m.Author != ids[0] || m.Order != 1 || m.Version != 1 {
		t.Fatal(m)
	}
	view, err := s.ArenaState("", Filters{Kind: "doubles", Period: "all", Player: ids[0]}, 0, "", nil)
	if err != nil || len(view.Matches) != 1 || len(view.Ratings) != 4 || view.Stats.Games != 1 {
		t.Fatal("result and ratings were not published together", view.Matches, err)
	}
	before := ratingFingerprint(t, s.App)
	if retry := mustRecord(t, s, ids[0], q); retry.ID != m.ID || ratingFingerprint(t, s.App) != before {
		t.Fatal("retry changed the result or rating history", retry)
	}
	q.ScoreB = 19
	if _, err := s.RecordMatch(ids[0], q); err == nil {
		t.Fatal("changed retry payload accepted")
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Matches != 1 || preview.History != 4 || preview.Changed != 0 {
		t.Fatal(preview, err)
	}
}

func TestArenaDirectCorrectionsAndOrder(t *testing.T) {
	s, ids := setup(t)
	first := mustRecord(t, s, ids[0], create(ids))
	q := create(ids)
	q.Position = 1
	q.DayVersions = map[string]int{q.Date: 0}
	if _, err := s.RecordMatch(ids[0], q); err == nil {
		t.Fatal("stale day order accepted")
	}
	versions, err := arenaDayVersions(s.App)
	if err != nil {
		t.Fatal(err)
	}
	q.DayVersions = versions
	second := mustRecord(t, s, ids[2], q)
	ms, err := loadMatches(s.App)
	if err != nil || len(ms) != 2 || ms[0].ID != second.ID || ms[1].ID != first.ID {
		t.Fatal("explicit position was lost", ms, err)
	}
	q = Mutation{RequestID: strings.Repeat("e", 24), Action: "edit", ID: first.ID, Version: first.Version, Kind: first.Kind, Date: first.Date, A: first.A, B: first.B, ScoreA: 18, ScoreB: 21}
	edited := mustRecord(t, s, ids[1], q)
	if edited.ScoreA != 18 || edited.Version != 2 || edited.Author != ids[0] {
		t.Fatal("correction or authorship", edited)
	}
	q.RequestID = strings.Repeat("v", 24)
	if _, err := s.RecordMatch(ids[0], q); err == nil {
		t.Fatal("stale match version accepted")
	}
	q = Mutation{RequestID: strings.Repeat("d", 24), Action: "delete", ID: edited.ID, Version: edited.Version}
	withdrawn := mustRecord(t, s, ids[0], q)
	preview, err := s.PreviewRatings()
	if err != nil || !withdrawn.Deleted || preview.History != 4 || preview.Changed != 0 {
		t.Fatal("withdrawal did not update ratings", preview, err)
	}
	q = Mutation{RequestID: strings.Repeat("r", 24), Action: "restore", ID: first.ID, Version: withdrawn.Version}
	restored := mustRecord(t, s, ids[2], q)
	preview, err = s.PreviewRatings()
	if err != nil || restored.Deleted || preview.History != 8 || preview.Changed != 0 {
		t.Fatal("restoration did not update ratings", preview, err)
	}
}

func TestArenaParticipantPermissions(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	if err := s.SetRole(ids[4], "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RecordMatch(ids[4], q); err == nil {
		t.Fatal("unrelated admin recorded a match")
	}
	m := mustRecord(t, s, ids[0], q)
	q = Mutation{RequestID: strings.Repeat("x", 24), Action: "edit", ID: m.ID, Version: m.Version, Kind: m.Kind, Date: m.Date, A: m.A, B: []string{ids[4], ids[5]}, ScoreA: 21, ScoreB: 15}
	if _, err := s.RecordMatch(ids[0], q); err == nil {
		t.Fatal("changed a recorded lineup")
	}
	q.B = m.B
	if _, err := s.RecordMatch(ids[4], q); err == nil {
		t.Fatal("unrelated admin edited a match")
	}
	if err := s.Suspend(ids[2]); err != nil {
		t.Fatal(err)
	}
	if _, err := s.RecordMatch(ids[2], q); err == nil {
		t.Fatal("suspended participant edited a match")
	}
	if _, err := s.RecordMatch(ids[0], create(ids)); err == nil {
		t.Fatal("new match with suspended opponent")
	}
}

func TestArenaCutoverResolvesOldReceipts(t *testing.T) {
	s, ids := setup(t)
	original := mustRecord(t, s, ids[0], create(ids))
	edit := Mutation{RequestID: strings.Repeat("e", 24), Action: "edit", ID: original.ID, Version: original.Version, Kind: original.Kind, Date: original.Date, A: original.A, B: original.B, ScoreA: 18, ScoreB: 21}
	stagePending(t, s, ids[2], edit)
	created := create(ids)
	pending := stagePending(t, s, ids[0], created)
	rejected := create(ids)
	old := stagePending(t, s, ids[0], rejected)
	if err := exec(s.App, "UPDATE kokko_proposals SET status='rejected' WHERE id={:id}", dbx.Params{"id": old.ID}); err != nil {
		t.Fatal(err)
	}
	if err := exec(s.App, "DELETE FROM kokko_arena_slots WHERE id={:id}", dbx.Params{"id": old.ID}); err != nil {
		t.Fatal(err)
	}
	identityRouter(t, s.App, false) // Serving drains the saved queue before opening HTTP.
	after := ratingFingerprint(t, s.App)
	if retry := mustRecord(t, s, ids[0], created); retry.ID != pending.ID || retry.Order != 2 {
		t.Fatal("old creation receipt did not resolve", retry)
	}
	if retry := mustRecord(t, s, ids[2], edit); retry.ID != original.ID || retry.ScoreA != 18 || retry.Author != ids[0] {
		t.Fatal("old edit receipt did not resolve", retry)
	}
	if _, err := s.RecordMatch(ids[0], rejected); err == nil {
		t.Fatal("old rejected request reported success")
	}
	if n, err := s.applyPendingMatches(); err != nil || n != 0 || ratingFingerprint(t, s.App) != after {
		t.Fatal("restart replayed the same requests", n, err)
	}
}

func TestArenaFriendsBlocksAndPrivacy(t *testing.T) {
	s, ids := setup(t)
	if err := s.Relate(ids[0], ids[0], "request"); err == nil {
		t.Fatal("self friendship")
	}
	if err := s.Relate(ids[0], ids[1], "request"); err != nil {
		t.Fatal(err)
	}
	if err := s.Relate(ids[0], ids[1], "accept"); err == nil {
		t.Fatal("accepted own friend request")
	}
	social, err := s.Social(ids[1])
	if err != nil || len(social.Incoming) != 1 || len(social.Friends) != 0 {
		t.Fatal(social, err)
	}
	if err := s.Relate(ids[1], ids[0], "accept"); err != nil {
		t.Fatal(err)
	}
	social, err = s.Social(ids[0])
	if err != nil || len(social.Friends) != 1 {
		t.Fatal(social, err)
	}
	mustRecord(t, s, ids[0], create(ids)) // Other opponents need not be friends.
	before := ratingFingerprint(t, s.App)
	if err := s.Relate(ids[1], ids[0], "block"); err != nil {
		t.Fatal(err)
	}
	if err := s.Relate(ids[0], ids[1], "request"); err == nil {
		t.Fatal("request bypassed block")
	}
	if _, err := s.RecordMatch(ids[2], create(ids)); err == nil {
		t.Fatal("third party formed blocked pair")
	}
	social, err = s.Social(ids[0])
	if err != nil || len(social.Friends) != 0 || len(social.Blocked) != 0 {
		t.Fatal("private block list leaked", social, err)
	}
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("friendship changed ratings/history")
	}
	if err := s.Relate(ids[1], ids[0], "unblock"); err != nil {
		t.Fatal(err)
	}
	social, _ = s.Social(ids[0])
	if len(social.Friends) != 0 {
		t.Fatal("unblock restored friendship without consent")
	}
}

func TestArenaPublicProjectionAndLegacyBypass(t *testing.T) {
	s, ids := setup(t)
	m := mustMatch(t, s, ids[0], create(ids))
	u, _ := s.App.FindRecordById("users", ids[0])
	token, _ := u.NewAuthToken()
	_, h := identityRouter(t, s.App, false)
	w := identityRequest(t, h, http.MethodGet, "/api/kokko/arena/state?player=all&period=all", "", nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	for _, secret := range []string{"@example.com", "email", "providerId", "tokenKey", "created_by", "redeemed", "\"groupId\"", "\"before\":\""} {
		if strings.Contains(w.Body.String(), secret) {
			t.Fatal("private projection leaked", secret)
		}
	}
	var state State
	if err := json.Unmarshal(w.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Matches) != 1 || state.Matches[0].ID != m.ID || len(state.Ratings) != 4 {
		t.Fatal("legacy match not published", state)
	}
	w = identityRequest(t, h, http.MethodGet, "/api/kokko/arena/leaderboard?kind=doubles", "", nil)
	if w.Code != 200 || !strings.Contains(w.Body.String(), ids[0]) {
		t.Fatal(w.Code, w.Body.String())
	}
	w = identityRequest(t, h, http.MethodGet, "/api/kokko/arena/state?period=all&player="+ids[0], "", nil)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	json.Unmarshal(w.Body.Bytes(), &state)
	if state.Stats.Games != 1 || state.Activity == nil || state.Activity.Games != 1 || state.Stats.Partners[0].Games != 1 {
		t.Fatal("public aggregate", state.Stats, state.Activity)
	}
	w = identityRequest(t, h, http.MethodPost, "/api/kokko/matches", token, create(ids))
	if w.Code != 410 {
		t.Fatal("legacy write bypass", w.Code, w.Body.String())
	}
	q := create(ids)
	old := mustMatch(t, s, ids[0], q)
	w = identityRequest(t, h, http.MethodPost, "/api/kokko/matches", token, q)
	if w.Code != 200 || !strings.Contains(w.Body.String(), old.ID) || !strings.Contains(w.Body.String(), `"legacy":true`) {
		t.Fatal("ambiguous legacy save not resolved", w.Code, w.Body.String())
	}
	w = identityRequest(t, h, http.MethodGet, "/api/kokko/arena/inbox", "", nil)
	if w.Code != 404 {
		t.Fatal("match inbox still available", w.Code)
	}
	q = create(ids)
	w = identityRequest(t, h, http.MethodPost, "/api/kokko/arena/matches", "", q)
	if w.Code != 401 {
		t.Fatal("anonymous match write", w.Code)
	}
	w = identityRequest(t, h, http.MethodPost, "/api/kokko/arena/matches", token, q)
	if w.Code != 200 || strings.Contains(w.Body.String(), `"groupId"`) {
		t.Fatal("direct result response", w.Code, w.Body.String())
	}
	retry := identityRequest(t, h, http.MethodPost, "/api/kokko/arena/proposals", token, q)
	if retry.Code != 200 || retry.Body.String() != w.Body.String() {
		t.Fatal("old route did not return the same receipt", retry.Code)
	}
}

func TestArenaMigrationAndArchiveRecovery(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ClearBootstrap() })
	var prior core.MigrationsList
	for _, m := range core.AppMigrations.Items() {
		if m.File < "1795219200_public_players.go" {
			prior.Add(m)
		}
	}
	if _, err := core.NewMigrationsRunner(app, prior).Up(); err != nil {
		t.Fatal(err)
	}
	s := New(app)
	ids := []string{}
	for i := 0; i < 4; i++ {
		ids = append(ids, newUser(t, s, "기존 선수", "active"))
	}
	mustMatch(t, s, ids[0], create(ids))
	before := ratingFingerprint(t, app)
	if err := app.CreateBackup(context.Background(), "before-public.zip"); err != nil {
		t.Fatal(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if ratingFingerprint(t, app) != before {
		t.Fatal("publication migration changed existing games or ratings")
	}
	var count struct {
		N int `db:"n"`
	}
	if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_player_handles").One(&count); err != nil || count.N != 4 {
		t.Fatal("handles not migrated", err)
	}
	dir := filepath.Join(t.TempDir(), "restored")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := RestoreArchive(dir, filepath.Join(app.DataDir(), "backups", "before-public.zip")); err != nil {
		t.Fatal(err)
	}
	restored := core.NewBaseApp(core.BaseAppConfig{DataDir: dir})
	if err := restored.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { restored.ClearBootstrap() })
	if ratingFingerprint(t, restored) != before {
		t.Fatal("old archive recovery mismatch")
	}
	if err := restored.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if ratingFingerprint(t, restored) != before {
		t.Fatal("rehearsed publication rewrote source")
	}
}

func TestArenaModerationAndFreshPermissions(t *testing.T) {
	s, ids := setup(t)
	if err := s.SetRole(ids[4], "admin"); err != nil {
		t.Fatal(err)
	}
	m := mustRecord(t, s, ids[0], create(ids))
	if err := s.Void(ids[1], m.ID, "잘못된 대진", m.Version); err == nil {
		t.Fatal("member moderated")
	}
	if err := s.Void(ids[4], m.ID, "잘못된 대진", m.Version); err != nil {
		t.Fatal(err)
	}
	withdrawn, err := acceptedMatch(s.App, m.ID)
	if err != nil || !withdrawn.Deleted {
		t.Fatal(withdrawn, err)
	}
	restore := Mutation{RequestID: strings.Repeat("r", 24), Action: "restore", ID: m.ID, Version: withdrawn.Version}
	if _, err := s.RecordMatch(ids[0], restore); err == nil {
		t.Fatal("participant restored moderated game")
	}
	if err := s.Reopen(ids[4], m.ID, "원래 대진 확인", withdrawn.Version); err != nil {
		t.Fatal(err)
	}
	after, _ := acceptedMatch(s.App, m.ID)
	if !after.Deleted {
		t.Fatal("reopening changed ratings")
	}
	restored := mustRecord(t, s, ids[0], restore)
	if err := s.SetRole(ids[4], "member"); err != nil {
		t.Fatal(err)
	}
	if err := s.Void(ids[4], m.ID, "이전 관리자", restored.Version); err == nil {
		t.Fatal("stale admin role authorized")
	}
	preview, err := s.PreviewRatings()
	if err != nil || restored.Deleted || preview.Changed != 0 || preview.Matches != 1 {
		t.Fatal(preview, err)
	}
}

func TestArenaBoundedHistoryAndExactAggregates(t *testing.T) {
	s, ids := setup(t)
	const games = 233
	err := s.App.RunInTransaction(func(app core.App) error {
		for i := 0; i < games; i++ {
			offset := i - 500
			if i >= 230 {
				offset = i - 232
			}
			m := Match{ID: fmt.Sprintf("aggregate%06d", i), GroupID: LegacyGroup, Kind: "doubles", Date: Today(s.Now().AddDate(0, 0, offset)), Order: 1, A: ids[:2], B: ids[2:4], ScoreA: 21, ScoreB: 18, Author: ids[0], Version: 1}
			if err := saveMatch(app, m); err != nil {
				return err
			}
			for j, id := range ids[:4] {
				team := "A"
				if j >= 2 {
					team = "B"
				}
				if err := exec(app, "INSERT INTO kokko_participants VALUES({:m},{:id},{:team},{:slot})", dbx.Params{"m": m.ID, "id": id, "team": team, "slot": j % 2}); err != nil {
					return err
				}
			}
			if err := exec(app, "INSERT INTO kokko_arena_slots VALUES({:id},{:date},1)", dbx.Params{"id": m.ID, "date": m.Date}); err != nil {
				return err
			}
		}
		ms, err := loadMatches(app)
		if err != nil {
			return err
		}
		return rebuild(app, ms, "doubles")
	})
	if err != nil {
		t.Fatal(err)
	}
	f := Filters{Kind: "doubles", Period: "all", Player: ids[0]}
	a, err := s.ArenaState("", f, 0, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	b, err := s.ArenaState("", f, 1, "", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(a.Matches) != 25 || len(b.Matches) != 25 || !a.HasMore || !a.ChartTruncated || len(a.Stats.Points) != 201 || a.Stats.Games != games || b.Stats.Games != games {
		t.Fatal("bounded history/SQL aggregates", len(a.Matches), len(a.Stats.Points), a.Stats.Games, b.Stats.Games)
	}
	seen := map[string]bool{}
	for _, m := range a.Matches {
		seen[m.ID] = true
	}
	for _, m := range b.Matches {
		if seen[m.ID] {
			t.Fatal("overlapping pages")
		}
	}
	if a.Activity == nil || len(a.Activity.Days) != 365 || a.Activity.Longest != 230 || a.Activity.Current != 3 || a.Activity.Games != 97 || a.Stats.Partners[0].Games != games {
		t.Fatal("truncated activity/pairs", a.Activity, a.Stats.Partners)
	}
	if len(a.AllMatches) != 0 {
		t.Fatal("anonymous planning snapshot")
	}
	// More than a page of friends is traversable; an exact relationship query
	// remains correct for a searched player outside the current list page.
	for i := 0; i < 27; i++ {
		id := newUser(t, s, fmt.Sprintf("친구 %02d", i), "active")
		if err := s.Relate(ids[0], id, "request"); err != nil {
			t.Fatal(err)
		}
		if err := s.Relate(id, ids[0], "accept"); err != nil {
			t.Fatal(err)
		}
	}
	social, err := s.Social(ids[0])
	if err != nil || len(social.Friends) != 25 || !social.HasMore {
		t.Fatal(social, err)
	}
	social2, err := s.Social(ids[0], SocialFilter{Page: 1})
	if err != nil || len(social2.Friends) != 2 || social2.HasMore {
		t.Fatal(social2, err)
	}
	exact, err := s.Social(ids[0], SocialFilter{Target: social2.Friends[0].ID})
	if err != nil || len(exact.Friends) != 1 {
		t.Fatal(exact, err)
	}
}

func TestArenaConcurrentRetryIsAtomic(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	matches := make(chan Match, 2)
	failures := make(chan error, 2)
	for range 2 {
		go func() {
			m, err := s.RecordMatch(ids[0], q)
			matches <- m
			failures <- err
		}()
	}
	first, second := <-matches, <-matches
	if first.ID == "" || first.ID != second.ID || <-failures != nil || <-failures != nil {
		t.Fatal("concurrent retry returned inconsistent results", first, second)
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Matches != 1 || preview.History != 4 || preview.Changed != 0 {
		t.Fatal(preview, err)
	}
}
