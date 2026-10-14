package kokko

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	_ "github.com/injoonH/kokko/apps/server/migrations"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
	"github.com/pocketbase/pocketbase/tools/types"
)

func setup(t *testing.T) (*Service, []string) {
	t.Helper()
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ClearBootstrap() })
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	app.Settings().Logs.MaxDays = 0
	s := New(app)
	s.Now = func() time.Time { return time.Date(2026, 10, 12, 3, 0, 0, 0, time.UTC) }
	ids := []string{}
	for i := 0; i < 6; i++ {
		ids = append(ids, newUser(t, s, fmt.Sprintf("선수%d", i), "active"))
	}
	return s, ids
}
func newUser(t *testing.T, s *Service, name, status string) string {
	t.Helper()
	c, err := s.App.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	u := core.NewRecord(c)
	u.SetEmail(security.RandomString(12) + "@example.com")
	u.SetPassword(security.RandomString(30))
	u.Set("name", name)
	u.Set("status", status)
	u.Set("role", "member")
	if err = s.App.Save(u); err != nil {
		t.Fatal(err)
	}
	ea := core.NewExternalAuth(s.App)
	ea.SetCollectionRef(c.Id)
	ea.SetRecordRef(u.Id)
	ea.SetProvider("google")
	ea.SetProviderId(security.RandomString(20))
	if err = s.App.Save(ea); err != nil {
		t.Fatal(err)
	}
	if status == "active" {
		if err = exec(s.App, "INSERT INTO kokko_profiles(id,nickname) VALUES({:id},{:n})", dbx.Params{"id": u.Id, "n": name}); err != nil {
			t.Fatal(err)
		}
	}
	return u.Id
}
func create(ids []string) Mutation {
	return Mutation{RequestID: security.RandomString(24), Action: "create", Kind: "doubles", Date: "2026-10-12", A: ids[:2], B: ids[2:4], ScoreA: 21, ScoreB: 15}
}
func update(t *testing.T, s *Service, m Match, action string) Mutation {
	t.Helper()
	days, err := dayVersions(s.App)
	if err != nil {
		t.Fatal(err)
	}
	return Mutation{RequestID: security.RandomString(24), Action: action, ID: m.ID, Version: m.Version, Kind: m.Kind, Date: m.Date, A: m.A, B: m.B, ScoreA: m.ScoreA, ScoreB: m.ScoreB, DayVersions: days}
}
func mustMatch(t *testing.T, s *Service, actor string, q Mutation) Match {
	t.Helper()
	m, e := s.Mutate(actor, q)
	if e != nil {
		t.Fatal(e)
	}
	return m
}
func assertReplay(t *testing.T, s *Service) {
	t.Helper()
	ms, e := loadMatches(s.App)
	if e != nil {
		t.Fatal(e)
	}
	for _, kind := range []string{"singles", "doubles"} {
		want, _ := Replay(ms, kind)
		got := []Rating{}
		if e = s.App.DB().NewQuery("SELECT * FROM kokko_rating_history WHERE kind={:k}").Bind(dbx.Params{"k": kind}).All(&got); e != nil {
			t.Fatal(e)
		}
		if len(got) != len(want) {
			t.Fatalf("replay count %s: %d != %d", kind, len(got), len(want))
		}
		for _, w := range want {
			found := false
			for _, g := range got {
				if w.MatchID == g.MatchID && w.PlayerID == g.PlayerID {
					found = true
					if math.Abs(w.After-g.After) > 1e-10 {
						t.Fatal("inconsistent replay")
					}
				}
			}
			if !found {
				t.Fatal("missing rating")
			}
		}
	}
}
func TestScores(t *testing.T) {
	for a := 0; a <= 31; a++ {
		for b := 0; b <= 31; b++ {
			hi, lo := max(a, b), min(a, b)
			want := (hi == 21 && lo <= 19) || (hi >= 22 && hi <= 29 && lo == hi-2) || (hi == 30 && (lo == 28 || lo == 29))
			if ValidScore(a, b) != want {
				t.Fatalf("%d:%d", a, b)
			}
		}
	}
	if ValidScore(-1, 21) {
		t.Fatal("negative")
	}
	for _, pair := range [][2]int{{21, 20}, {22, 19}, {30, 27}, {30, 30}} {
		if ValidScore(pair[0], pair[1]) {
			t.Fatal(pair)
		}
	}
}
func TestValidationAndPermissions(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	if _, e := s.Mutate(ids[4], q); e == nil {
		t.Fatal("nonparticipant accepted")
	}
	s.SetRole(ids[4], "admin")
	if _, e := s.Mutate(ids[4], q); e == nil {
		t.Fatal("admin nonparticipant accepted")
	}
	q.A = []string{ids[0], ids[0]}
	if _, e := s.Mutate(ids[0], q); e == nil {
		t.Fatal("duplicate accepted")
	}
	q = create(ids)
	q.A = q.A[:1]
	if _, e := s.Mutate(ids[0], q); e == nil {
		t.Fatal("invalid team accepted")
	}
	q = create(ids)
	q.Date = "2026-10-13"
	if _, e := s.Mutate(ids[0], q); e == nil {
		t.Fatal("future date")
	}
	m := mustMatch(t, s, ids[0], create(ids))
	edit := update(t, s, m, "edit")
	edit.A = []string{ids[4], ids[1]}
	if _, e := s.Mutate(ids[0], edit); e == nil {
		t.Fatal("author removed self")
	}
	if _, e := s.Mutate(ids[1], update(t, s, m, "delete")); e == nil {
		t.Fatal("unauthorized delete")
	}
	m = mustMatch(t, s, ids[4], edit)
	if m.Author != ids[0] {
		t.Fatal("ownership changed")
	}
	assertReplay(t, s)
}
func TestKnownElo(t *testing.T) {
	for _, kind := range []string{"singles", "doubles"} {
		m := Match{ID: "m", Kind: kind, A: []string{"a"}, B: []string{"b"}, ScoreA: 21, ScoreB: 15}
		if kind == "doubles" {
			m.A = append(m.A, "c")
			m.B = append(m.B, "d")
		}
		rs, _ := Replay([]Match{m}, kind)
		for _, r := range rs {
			if math.Abs(r.Delta) != 16 {
				t.Fatalf("%s delta %f", kind, r.Delta)
			}
		}
	}
	ms := []Match{{ID: "a", Kind: "singles", A: []string{"a"}, B: []string{"b"}, ScoreA: 21, ScoreB: 5, Order: 1}, {ID: "b", Kind: "singles", A: []string{"a"}, B: []string{"b"}, ScoreA: 10, ScoreB: 21, Order: 2}}
	rs, _ := Replay(ms, "singles")
	if math.Abs(rs[2].Delta-(-17.46950152897548)) > 1e-6 {
		t.Fatal(rs)
	}
}
func TestHistoricalCorrectionsAndRollback(t *testing.T) {
	s, ids := setup(t)
	first := mustMatch(t, s, ids[0], create(ids))
	q := create(ids)
	q.ScoreA, q.ScoreB = 10, 21
	second := mustMatch(t, s, ids[0], q)
	q = create(ids)
	q.Date = "2026-10-01"
	old := mustMatch(t, s, ids[0], q)
	assertReplay(t, s)
	move := update(t, s, second, "move")
	move.Position = 1
	second = mustMatch(t, s, ids[0], move)
	assertReplay(t, s)
	stale := update(t, s, first, "edit")
	mustMatch(t, s, ids[0], create(ids))
	if _, e := s.Mutate(ids[0], stale); e == nil {
		t.Fatal("stale day accepted")
	}
	change := update(t, s, old, "edit")
	change.Kind = "singles"
	change.A = ids[:1]
	change.B = ids[2:3]
	old = mustMatch(t, s, ids[0], change)
	assertReplay(t, s)
	old = mustMatch(t, s, ids[0], update(t, s, old, "delete"))
	assertReplay(t, s)
	if _, e := s.Mutate(ids[0], update(t, s, old, "restore")); e == nil {
		t.Fatal("ordinary restore")
	}
	s.SetRole(ids[4], "admin")
	mustMatch(t, s, ids[4], update(t, s, old, "restore"))
	assertReplay(t, s)
	// Failure after match writes must roll back match, order, audit and ratings.
	before, _ := loadMatches(s.App)
	exec(s.App, `CREATE TRIGGER kokko_test_fail BEFORE INSERT ON kokko_rating_history BEGIN SELECT RAISE(ABORT,'injected'); END`, nil)
	if _, e := s.Mutate(ids[0], create(ids)); e == nil {
		t.Fatal("expected injected failure")
	}
	after, _ := loadMatches(s.App)
	if encode(before) != encode(after) {
		t.Fatal("partial match commit")
	}
	exec(s.App, "DROP TRIGGER kokko_test_fail", nil)
	assertReplay(t, s)
}
func TestConcurrentAndRetrySafe(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	var wg sync.WaitGroup
	errs := make(chan error, 20)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, e := s.Mutate(ids[0], q); errs <- e }()
	}
	wg.Wait()
	for i := 0; i < 10; i++ {
		if e := <-errs; e != nil {
			t.Fatal(e)
		}
	}
	ms, _ := loadMatches(s.App)
	if len(ms) != 1 {
		t.Fatal("duplicate retry")
	}
	q.ScoreB = 14
	if _, e := s.Mutate(ids[0], q); e == nil {
		t.Fatal("changed idempotent payload")
	}
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, e := s.Mutate(ids[0], create(ids)); errs <- e }()
	}
	wg.Wait()
	for i := 0; i < 10; i++ {
		if e := <-errs; e != nil {
			t.Fatal(e)
		}
	}
	ms, _ = loadMatches(s.App)
	if len(ms) != 11 {
		t.Fatal("genuine repeats lost")
	}
	for i, m := range ms {
		if m.Order != i+1 {
			t.Fatal("duplicate order")
		}
	}
	assertReplay(t, s)
}
func TestInvitationAndSuspension(t *testing.T) {
	s, ids := setup(t)
	a := newUser(t, s, "대기1", "pending")
	b := newUser(t, s, "대기2", "pending")
	if _, e := s.State(a, Filters{}); e == nil {
		t.Fatal("pending read")
	}
	if _, e := s.Mutate(a, create(ids)); e == nil {
		t.Fatal("pending write")
	}
	if _, e := s.CreateInvitation(ids[0], false); e == nil {
		t.Fatal("member invite")
	}
	code, e := s.CreateInvitation("operator", true)
	if e != nil {
		t.Fatal(e)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, id := range []string{a, b} {
		wg.Add(1)
		go func(id string) { defer wg.Done(); results <- s.Redeem(id, code) }(id)
	}
	wg.Wait()
	success := 0
	for i := 0; i < 2; i++ {
		if <-results == nil {
			success++
		}
	}
	if success != 1 {
		t.Fatal("invitation reused")
	}
	u, _ := s.App.FindRecordById("users", a)
	if u.GetString("status") != "active" {
		a = b
	}
	if e = s.Redeem(a, code); e != nil {
		t.Fatal("same account retry", e)
	}
	if e = s.Suspend(ids[0]); e != nil {
		t.Fatal(e)
	}
	if _, e = s.State(ids[0], Filters{}); e == nil {
		t.Fatal("suspended read")
	}
	q := create(ids)
	if _, e = s.Mutate(ids[1], q); e == nil {
		t.Fatal("suspended new participant")
	}
}
func TestPeriodAndSynergy(t *testing.T) {
	s, ids := setup(t)
	q := create(ids)
	q.Date = "2026-09-01"
	mustMatch(t, s, ids[0], q)
	for i := 0; i < 4; i++ {
		mustMatch(t, s, ids[0], create(ids))
	}
	state, e := s.State(ids[0], Filters{Period: "7"})
	if e != nil {
		t.Fatal(e)
	}
	if state.Stats.Points[0].Rating != 1016 || state.Stats.Games != 4 || state.Stats.Partners[0].Synergy != nil {
		t.Fatal("baseline or insufficient sample", state.Stats)
	}
	if math.Abs(state.Stats.Change-(state.Stats.Current-1016)) > 1e-8 {
		t.Fatal("period delta")
	}
	mustMatch(t, s, ids[0], create(ids))
	state, _ = s.State(ids[0], Filters{Period: "7"})
	if state.Stats.Partners[0].Synergy == nil {
		t.Fatal("missing synergy")
	}
	s.Now = func() time.Time { return time.Date(2027, 1, 1, 0, 0, 0, 0, time.UTC) }
	state, _ = s.State(ids[0], Filters{Period: "7"})
	if state.Stats.Games != 0 || state.Stats.Change != 0 || state.Stats.Points[0].Rating == 0 {
		t.Fatal("empty period")
	}
	if Today(time.Date(2026, 10, 11, 15, 0, 0, 0, time.UTC)) != "2026-10-12" {
		t.Fatal("timezone")
	}
}
func TestHTTPBoundaries(t *testing.T) {
	s, ids := setup(t)
	Register(s.App, t.TempDir())
	router, err := apis.NewRouter(s.App)
	if err != nil {
		t.Fatal(err)
	}
	event := &core.ServeEvent{App: s.App, Router: router}
	if err = s.App.OnServe().Trigger(event); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path, id, payload string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewBufferString(payload))
		r.Header.Set("Content-Type", "application/json")
		if id != "" {
			u, _ := s.App.FindRecordById("users", id)
			token, _ := u.NewAuthToken()
			r.Header.Set("Authorization", token)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	pending := newUser(t, s, "대기", "pending")
	for _, id := range []string{"", pending} {
		w := request("GET", "/api/kokko/state", id, "")
		if w.Code < 400 {
			t.Fatal("data leak")
		}
	}
	for _, path := range []string{"/api/collections/users/records", "/api/collections/users/records/" + ids[1]} {
		w := request("GET", path, ids[0], "")
		if bytes.Contains(w.Body.Bytes(), []byte("@example.com")) {
			t.Fatal("email leak")
		}
	}
	w := request("PATCH", "/api/collections/users/records/"+ids[0], ids[0], `{"role":"admin","status":"active"}`)
	if w.Code < 400 {
		t.Fatal("role escalation")
	}
	w = request("POST", "/api/kokko/matches", ids[0], `{"requestId":"abcdefghijklmnopqrst","action":"create","kind":"singles","date":"2026-01-01","a":["x"],"b":["y"],"scoreA":21.5,"scoreB":10}`)
	if w.Code != 400 {
		t.Fatal("fractional score", w.Code)
	}
	w = request("GET", "/api/kokko/state", ids[0], "")
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var state State
	if err = json.Unmarshal(w.Body.Bytes(), &state); err != nil {
		t.Fatal(err)
	}
	if len(state.Profiles) != 6 {
		t.Fatal("pending profile leaked")
	}
}

func TestBackupRestore(t *testing.T) {
	s, ids := setup(t)
	mustMatch(t, s, ids[0], create(ids))
	before, err := s.State(ids[0], Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.App.CreateBackup(context.Background(), "acceptance.zip"); err != nil {
		t.Fatal(err)
	}
	mustMatch(t, s, ids[0], create(ids))
	dir := filepath.Join(t.TempDir(), "restored")
	if err = os.Mkdir(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err = RestoreArchive(dir, filepath.Join(s.App.DataDir(), "backups", "acceptance.zip")); err != nil {
		t.Fatal(err)
	}
	restored := core.NewBaseApp(core.BaseAppConfig{DataDir: dir})
	if err = restored.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { restored.ClearBootstrap() })
	restoredService := New(restored)
	restoredService.Now = s.Now
	after, err := restoredService.State(ids[0], Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if encode(before) != encode(after) {
		t.Fatal("restored snapshot differs")
	}
}

func TestGoogleSignupIgnoresPrivilegePayload(t *testing.T) {
	s, _ := setup(t)
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/token" {
			fmt.Fprint(w, `{"access_token":"test-token","token_type":"Bearer","expires_in":3600}`)
		} else {
			fmt.Fprint(w, `{"sub":"google-test-id","name":"Google 회원","email":"oauth@example.com","email_verified":true}`)
		}
	}))
	defer provider.Close()
	c, _ := s.App.FindCollectionByNameOrId("users")
	c.OAuth2.Enabled = true
	c.OAuth2.Providers = []core.OAuth2ProviderConfig{{Name: "google", ClientId: "test", ClientSecret: "test", TokenURL: provider.URL + "/token", UserInfoURL: provider.URL + "/userinfo"}}
	if err := s.App.Save(c); err != nil {
		t.Fatal(err)
	}
	Register(s.App, t.TempDir())
	router, _ := apis.NewRouter(s.App)
	event := &core.ServeEvent{App: s.App, Router: router}
	if err := s.App.OnServe().Trigger(event); err != nil {
		t.Fatal(err)
	}
	handler, _ := router.BuildMux()
	q := `{"provider":"google","code":"test-code","codeVerifier":"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq","redirectURL":"http://localhost:5173/auth/callback","createData":{"role":"admin","status":"active","emailVisibility":true}}`
	req := httptest.NewRequest("POST", "/api/collections/users/auth-with-oauth2", bytes.NewBufferString(q))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		Record map[string]any `json:"record"`
	}
	json.Unmarshal(w.Body.Bytes(), &result)
	if result.Record["status"] != "pending" || result.Record["role"] != "member" || result.Record["emailVisibility"] != false {
		t.Fatal("privileged OAuth signup", result)
	}
	direct := httptest.NewRequest("POST", "/api/collections/users/records", bytes.NewBufferString(`{"email":"direct@example.com","password":"abcdefghijk1234","passwordConfirm":"abcdefghijk1234","status":"active","role":"admin"}`))
	direct.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	handler.ServeHTTP(w, direct)
	if w.Code < 400 {
		t.Fatal("direct signup bypass")
	}
	// Document that the OAuth-only create rule is server-context based.
	if c.CreateRule == nil || *c.CreateRule != *types.Pointer("@request.context = 'oauth2'") {
		t.Fatal("wrong create rule")
	}
}
