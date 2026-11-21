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
func mustProposal(t *testing.T, s *Service, actor string, q Mutation) Proposal {
	t.Helper()
	p, err := s.Submit(actor, q)
	if err != nil {
		t.Fatal(err)
	}
	return p
}
func mustConfirm(t *testing.T, s *Service, actor string, p Proposal) Proposal {
	t.Helper()
	p, err := s.Decide(actor, p.ID, "confirm", p.Version)
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestArenaConfirmationAndIdempotency(t *testing.T) {
	s, ids := setup(t)
	if err := s.SetGroupMember(LegacyGroup, ids[0], "left"); err != nil {
		t.Fatal(err)
	}
	before := ratingFingerprint(t, s.App)
	q := create(ids)
	p := mustProposal(t, s, ids[0], q)
	if p.Status != "pending" || p.Actor != ids[0] {
		t.Fatal(p)
	}
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("pending submission changed accepted history/ratings")
	}
	retry := mustProposal(t, s, ids[0], q)
	if retry.ID != p.ID {
		t.Fatal("duplicate submission")
	}
	q.ScoreB = 19
	if _, err := s.Submit(ids[0], q); err == nil {
		t.Fatal("changed retry payload")
	}
	for _, id := range []string{ids[0], ids[1], ids[4]} {
		if err := s.SetRole(id, "admin"); err != nil {
			t.Fatal(err)
		}
		if _, err := s.Decide(id, p.ID, "confirm", p.Version); err == nil {
			t.Fatal("non-opponent/admin confirmed", id)
		}
	}
	confirmed := mustConfirm(t, s, ids[2], p)
	if confirmed.Status != "confirmed" || confirmed.ConfirmedBy != ids[2] || confirmed.Match.Author != ids[0] {
		t.Fatal("confirmation changed ownership", confirmed)
	}
	after := ratingFingerprint(t, s.App)
	mustConfirm(t, s, ids[2], p)
	if ratingFingerprint(t, s.App) != after {
		t.Fatal("confirmation retry changed ratings")
	}
	if _, err := s.Decide(ids[3], p.ID, "confirm", p.Version); err == nil {
		t.Fatal("second confirmer overwrote first")
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Matches != 1 || preview.History != 4 || preview.Changed != 0 {
		t.Fatal(preview, err)
	}
}

func TestArenaLateApprovalAndPendingCorrections(t *testing.T) {
	s, ids := setup(t)
	first := mustProposal(t, s, ids[0], create(ids))
	q := create(ids)
	q.ScoreA = 18
	q.ScoreB = 21
	second := mustProposal(t, s, ids[0], q)
	mustConfirm(t, s, ids[2], second)
	visible, err := s.ArenaState("", Filters{Kind: "doubles", Period: "all", Player: ids[0]}, 0, "", nil)
	if err != nil || len(visible.Matches) != 1 || visible.Matches[0].Order != 1 || visible.Stats.Points[1].Order != 1 {
		t.Fatal("private reservation affected public ordinal", visible.Matches, err)
	}
	planning, err := s.ArenaState(ids[0], Filters{Kind: "doubles", Period: "all", Player: ids[0]}, 0, "", nil)
	if err != nil || len(planning.PlanningMatches) != 2 || planning.PlanningMatches[0].ID != first.MatchID || planning.PlanningMatches[1].ID != second.MatchID || planning.PlanningMatches[1].Order != 2 {
		t.Fatal("planning timeline lost reserved chronology", planning.PlanningMatches, err)
	}
	if first.Intent != "제출 시점의 마지막 순서로 예약" {
		t.Fatal("missing approval order intent", first.Intent)
	}
	mustConfirm(t, s, ids[2], first)
	ms, err := loadMatches(s.App)
	if err != nil || len(ms) != 2 || ms[0].ID != first.MatchID || ms[1].ID != second.MatchID {
		t.Fatal("approval arrival reordered play", ms, err)
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Changed != 0 {
		t.Fatal("replay mismatch", preview, err)
	}
	m, err := acceptedMatch(s.App, first.MatchID)
	if err != nil {
		t.Fatal(err)
	}
	q = Mutation{RequestID: strings.Repeat("e", 24), Action: "edit", ID: m.ID, Version: m.Version, Kind: m.Kind, Date: m.Date, A: m.A, B: m.B, ScoreA: 18, ScoreB: 21}
	before := ratingFingerprint(t, s.App)
	edit := mustProposal(t, s, ids[1], q) // Any participant may propose, not only the original author.
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("pending edit replaced accepted score")
	}
	if _, err := s.Decide(ids[0], edit.ID, "confirm", edit.Version); err == nil {
		t.Fatal("teammate approved correction")
	}
	mustConfirm(t, s, ids[2], edit)
	m, _ = acceptedMatch(s.App, m.ID)
	if m.ScoreA != 18 || m.Version != 2 || m.Author != ids[0] {
		t.Fatal("correction or authorship", m)
	}
	q = Mutation{RequestID: strings.Repeat("d", 24), Action: "delete", ID: m.ID, Version: m.Version}
	before = ratingFingerprint(t, s.App)
	withdraw := mustProposal(t, s, ids[0], q)
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("unapproved withdrawal removed a loss")
	}
	if _, err := s.Decide(ids[2], withdraw.ID, "reject", withdraw.Version); err != nil {
		t.Fatal(err)
	}
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("rejected withdrawal changed ratings")
	}
	q.RequestID = strings.Repeat("r", 24)
	withdraw = mustProposal(t, s, ids[0], q)
	mustConfirm(t, s, ids[2], withdraw)
	m, _ = acceptedMatch(s.App, m.ID)
	if !m.Deleted {
		t.Fatal("accepted withdrawal missing")
	}
	q = Mutation{RequestID: strings.Repeat("s", 24), Action: "restore", ID: m.ID, Version: m.Version}
	restore := mustProposal(t, s, ids[0], q)
	mustConfirm(t, s, ids[2], restore)
	preview, err = s.PreviewRatings()
	if err != nil || preview.Changed != 0 || preview.Matches != 2 {
		t.Fatal(preview, err)
	}
}

func TestArenaCancellationSuspensionAndLineup(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	if _, err := s.Submit(ids[4], q); err == nil {
		t.Fatal("nonparticipant submitted")
	}
	p := mustProposal(t, s, ids[0], q)
	if _, err := s.Decide(ids[2], p.ID, "cancel", p.Version); err == nil {
		t.Fatal("opponent cancelled as owner")
	}
	if _, err := s.Decide(ids[0], p.ID, "cancel", p.Version); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Decide(ids[2], p.ID, "confirm", p.Version); err == nil {
		t.Fatal("cancelled result accepted")
	}
	q = create(ids)
	p = mustProposal(t, s, ids[0], q)
	if err := s.Suspend(ids[0]); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Decide(ids[2], p.ID, "confirm", p.Version); err == nil {
		t.Fatal("suspended proposer accepted")
	}
	if _, err := s.Decide(ids[2], p.ID, "reject", p.Version); err != nil {
		t.Fatal("could not dismiss inactive request", err)
	}
	s2, players := setup(t)
	p = mustProposal(t, s2, players[0], create(players))
	m := mustConfirm(t, s2, players[2], p).Match
	q = Mutation{RequestID: strings.Repeat("x", 24), Action: "edit", ID: m.ID, Version: m.Version, Kind: m.Kind, Date: m.Date, A: []string{players[0], players[1]}, B: []string{players[4], players[5]}, ScoreA: 21, ScoreB: 15}
	if _, err := s2.Submit(players[0], q); err == nil {
		t.Fatal("replaced opponents to rewrite accepted result")
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
	p := mustProposal(t, s, ids[0], create(ids))
	mustConfirm(t, s, ids[2], p) // Other opponents need not be friends.
	before := ratingFingerprint(t, s.App)
	if err := s.Relate(ids[1], ids[0], "block"); err != nil {
		t.Fatal(err)
	}
	if err := s.Relate(ids[0], ids[1], "request"); err == nil {
		t.Fatal("request bypassed block")
	}
	if _, err := s.Submit(ids[2], create(ids)); err == nil {
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
	if w.Code != 401 {
		t.Fatal("inbox public", w.Code)
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
	p := mustProposal(t, s, ids[0], create(ids))
	m := mustConfirm(t, s, ids[2], p).Match
	q := Mutation{RequestID: strings.Repeat("c", 24), Action: "edit", ID: m.ID, Version: m.Version, Kind: m.Kind, Date: m.Date, A: m.A, B: m.B, ScoreA: 18, ScoreB: 21, Position: 1}
	versions, err := arenaDayVersions(s.App)
	if err != nil {
		t.Fatal(err)
	}
	q.DayVersions = versions
	edit := mustProposal(t, s, ids[0], q)
	inbox, _, _, err := s.Inbox(ids[2], 0)
	if err != nil || len(inbox) != 2 || inbox[0].Before == nil || inbox[0].Before.ScoreA != 21 {
		t.Fatal("correction comparison", inbox, err)
	}
	if err := s.Void(ids[1], m.ID, "잘못된 대진", m.Version); err == nil {
		t.Fatal("member moderated")
	}
	if err := s.Void(ids[4], m.ID, "잘못된 대진", m.Version); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Decide(ids[2], edit.ID, "confirm", edit.Version); err == nil {
		t.Fatal("stale proposal reversed moderation")
	}
	closed, err := proposal(s.App, edit.ID)
	if err != nil || closed.Status != "superseded" {
		t.Fatal(closed, err)
	}
	m, err = acceptedMatch(s.App, m.ID)
	if err != nil || !m.Deleted {
		t.Fatal(m, err)
	}
	restore := Mutation{RequestID: strings.Repeat("r", 24), Action: "restore", ID: m.ID, Version: m.Version}
	if _, err := s.Submit(ids[0], restore); err == nil {
		t.Fatal("participant restored moderated game")
	}
	if err := s.Reopen(ids[4], m.ID, "원래 대진 확인", m.Version); err != nil {
		t.Fatal(err)
	}
	after, _ := acceptedMatch(s.App, m.ID)
	if !after.Deleted {
		t.Fatal("reopening bypassed confirmation")
	}
	restored := mustProposal(t, s, ids[0], restore)
	mustConfirm(t, s, ids[2], restored)
	// Tokens/old UI cannot retain an admin role after revocation.
	if err := s.SetRole(ids[4], "member"); err != nil {
		t.Fatal(err)
	}
	after, _ = acceptedMatch(s.App, m.ID)
	if err := s.Void(ids[4], m.ID, "이전 관리자", after.Version); err == nil {
		t.Fatal("stale admin role authorized")
	}
	if err := s.Suspend(ids[2]); err != nil {
		t.Fatal(err)
	}
	next := mustProposal(t, s, ids[0], create([]string{ids[0], ids[1], ids[3], ids[5]}))
	if _, err := s.Decide(ids[2], next.ID, "confirm", next.Version); err == nil {
		t.Fatal("suspended confirmer authorized")
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Changed != 0 {
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
	if len(a.AllMatches) != 0 || len(a.PlanningMatches) != 0 {
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

func TestArenaConcurrentConfirmationIsAtomic(t *testing.T) {
	s, ids := setup(t)
	p := mustProposal(t, s, ids[0], create(ids))
	result := make(chan error, 2)
	for _, id := range ids[2:4] {
		go func(id string) { _, err := s.Decide(id, p.ID, "confirm", p.Version); result <- err }(id)
	}
	successes := 0
	for i := 0; i < 2; i++ {
		if <-result == nil {
			successes++
		}
	}
	if successes != 1 {
		t.Fatal("confirmation winners", successes)
	}
	preview, err := s.PreviewRatings()
	if err != nil || preview.Matches != 1 || preview.History != 4 || preview.Changed != 0 {
		t.Fatal(preview, err)
	}
}
