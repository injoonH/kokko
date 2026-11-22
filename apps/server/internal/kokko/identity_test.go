package kokko

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

// Test-only provider: real redirect/code exchange and PocketBase parsing, with
// synthetic identities. No test auth endpoint is compiled into the application.
type oauthIdentity struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Verified bool   `json:"verified"`
	Modern   bool   `json:"modern"`
}
type oauthFixture struct {
	mu     sync.Mutex
	users  map[string]oauthIdentity
	codes  map[string]oauthIdentity
	server *httptest.Server
}

func mockOAuth(t *testing.T, app core.App) *oauthFixture {
	t.Helper()
	f := &oauthFixture{users: map[string]oauthIdentity{
		"google": {ID: "google-new", Name: "Google 회원", Email: "google@example.com", Verified: true},
		"kakao":  {ID: "10001", Name: "카카오 회원", Modern: true},
	}, codes: map[string]oauthIdentity{}}
	f.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.mu.Lock()
		defer f.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if strings.HasPrefix(r.URL.Path, "/authorize/") {
			provider := strings.TrimPrefix(r.URL.Path, "/authorize/")
			code := security.RandomString(32)
			f.codes[code] = f.users[provider]
			q := url.Values{"code": {code}, "state": {r.URL.Query().Get("state")}}
			http.Redirect(w, r, r.URL.Query().Get("redirect_uri")+"?"+q.Encode(), http.StatusFound)
		} else if r.URL.Path == "/token" {
			r.ParseForm()
			json.NewEncoder(w).Encode(map[string]any{"access_token": r.Form.Get("code"), "token_type": "Bearer", "expires_in": 3600})
		} else {
			if strings.HasSuffix(r.URL.Path, "/emails") {
				fmt.Fprint(w, "[]")
				return
			}
			provider := strings.TrimPrefix(r.URL.Path, "/userinfo/")
			u, ok := f.codes[strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")]
			if !ok {
				u = f.users[provider]
			}
			if provider == "google" {
				json.NewEncoder(w).Encode(map[string]any{"sub": u.ID, "name": u.Name, "email": u.Email, "email_verified": u.Verified})
			} else if provider == "kakao" {
				var id int64
				fmt.Sscan(u.ID, &id)
				data := map[string]any{"id": id, "kakao_account": map[string]any{"email": u.Email, "is_email_valid": u.Verified, "is_email_verified": u.Verified, "profile": map[string]any{"nickname": u.Name}}}
				if !u.Modern {
					data["properties"] = map[string]any{"nickname": u.Name}
				}
				json.NewEncoder(w).Encode(data)
			} else {
				json.NewEncoder(w).Encode(map[string]any{"id": 42, "login": "unsupported"})
			}
		}
	}))
	t.Cleanup(f.server.Close)
	c, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	c.OAuth2.Enabled = true
	c.OAuth2.Providers = nil
	for _, name := range []string{"google", "kakao", "github"} {
		c.OAuth2.Providers = append(c.OAuth2.Providers, core.OAuth2ProviderConfig{Name: name, ClientId: "test", ClientSecret: "test", AuthURL: f.server.URL + "/authorize/" + name, TokenURL: f.server.URL + "/token", UserInfoURL: f.server.URL + "/userinfo/" + name})
	}
	if err := app.Save(c); err != nil {
		t.Fatal(err)
	}
	return f
}
func (f *oauthFixture) set(provider string, u oauthIdentity) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.users[provider] = u
}
func identityRouter(t *testing.T, app core.App, signup bool) (*Service, http.Handler) {
	t.Helper()
	s := Register(app, t.TempDir(), IdentityOptions{PublicSignup: signup})
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err = app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	return s, handler
}
func identityRequest(t *testing.T, h http.Handler, method, path, token string, data any) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, bytes.NewBufferString(encode(data)))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", token)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}
func oauthRequest(t *testing.T, h http.Handler, provider, token, mode string) *httptest.ResponseRecorder {
	t.Helper()
	path := "/api/collections/users/auth-with-oauth2"
	if mode != "" {
		path += "?kokkoMode=" + mode
	}
	return identityRequest(t, h, "POST", path, token, map[string]any{"provider": provider, "code": "unit-test-code", "codeVerifier": strings.Repeat("x", 43), "redirectURL": "http://localhost:5173/auth/callback", "createData": map[string]any{"status": "active", "role": "admin", "name": "attacker", "emailVisibility": true, "verified": true, "email": "attacker@example.com"}})
}
func authResult(t *testing.T, w *httptest.ResponseRecorder) (string, string) {
	t.Helper()
	if w.Code != 200 {
		t.Fatalf("auth status %d: %s", w.Code, w.Body.String())
	}
	var result struct {
		Token  string `json:"token"`
		Record struct {
			ID string `json:"id"`
		} `json:"record"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	if result.Token == "" || result.Record.ID == "" {
		t.Fatal("missing auth result")
	}
	if strings.Contains(w.Body.String(), "accessToken") || strings.Contains(w.Body.String(), "rawUser") {
		t.Fatal("provider credentials leaked")
	}
	return result.Record.ID, result.Token
}

func TestIdentityProviderConfiguration(t *testing.T) {
	s, _ := setup(t)
	for _, tc := range []struct {
		googleID, googleSecret, kakaoID, kakaoSecret string
		want                                         string
	}{
		{"", "", "", "", "[]"}, {"google", "secret", "", "", `["google"]`},
		{"incomplete", "", "kakao", "secret", `["kakao"]`}, {"google", "secret", "kakao", "secret", `["google","kakao"]`},
	} {
		if err := ConfigureOAuth(s.App, tc.googleID, tc.googleSecret, tc.kakaoID, tc.kakaoSecret); err != nil {
			t.Fatal(err)
		}
		providers, err := configuredProviders(s.App)
		if err != nil || encode(providers) != tc.want {
			t.Fatal(providers, err)
		}
	}
	c, _ := s.App.FindCollectionByNameOrId("users")
	p, err := c.OAuth2.Providers[1].InitProvider()
	if err != nil || encode(p.Scopes()) != `["profile_nickname"]` || !p.PKCE() {
		t.Fatal("Kakao must use minimal consent and PKCE", err)
	}
	_, h := identityRouter(t, s.App, false)
	w := identityRequest(t, h, "GET", "/api/kokko/auth", "", nil)
	if w.Code != 200 || strings.Contains(w.Body.String(), "secret") || strings.Contains(w.Body.String(), "client") {
		t.Fatal(w.Body.String())
	}
}

func TestOAuthStableIdentitySignup(t *testing.T) {
	for _, tc := range []struct {
		provider  string
		user      oauthIdentity
		wantEmail string
	}{
		{"google", oauthIdentity{ID: "g1", Name: "Google 회원", Email: "valid@example.com", Verified: true}, "valid@example.com"},
		{"google", oauthIdentity{ID: "g2", Email: "unverified@example.com"}, ""},
		{"google", oauthIdentity{ID: "g3"}, ""},
		{"kakao", oauthIdentity{ID: "1001", Name: "카카오 새 회원", Modern: true}, ""},
		{"kakao", oauthIdentity{ID: "1002", Name: "예전 닉네임", Email: "unverified@example.com"}, ""},
		{"kakao", oauthIdentity{ID: "1003", Email: "kakao@example.com", Verified: true}, "kakao@example.com"},
	} {
		t.Run(tc.provider+tc.user.ID, func(t *testing.T) {
			s, _ := setup(t)
			f := mockOAuth(t, s.App)
			f.set(tc.provider, tc.user)
			_, h := identityRouter(t, s.App, true)
			id, token := authResult(t, oauthRequest(t, h, tc.provider, "", ""))
			repeated, _ := authResult(t, oauthRequest(t, h, tc.provider, "", ""))
			if repeated != id {
				t.Fatal("returning provider changed account")
			}
			u, _ := s.App.FindRecordById("users", id)
			if u.Email() != tc.wantEmail || u.GetBool("emailVisibility") || u.GetString("status") != "pending" || u.GetString("role") != "member" || u.GetString("name") != tc.user.Name {
				t.Fatal("unsafe signup fields", u)
			}
			if got, _ := ownGroups(s.App, id); len(got) != 0 {
				t.Fatal("implicit legacy membership")
			}
			w := identityRequest(t, h, "GET", "/api/kokko/me", token, nil)
			if w.Code != 200 || !strings.Contains(w.Body.String(), `"profile":null`) || !strings.Contains(w.Body.String(), `"groups":[]`) {
				t.Fatal(w.Code, w.Body.String())
			}
			w = identityRequest(t, h, "GET", "/api/kokko/state?group=legacy", token, nil)
			if w.Code < 400 {
				t.Fatal("pending private access")
			}
		})
	}
}

func TestOAuthLinkingPreservesAccountAndRatings(t *testing.T) {
	s, ids := setup(t)
	mustMatch(t, s, ids[0], create(ids))
	if err := s.SetRole(ids[0], "admin"); err != nil {
		t.Fatal(err)
	}
	u, _ := s.App.FindRecordById("users", ids[0])
	token, _ := u.NewAuthToken()
	before, _ := s.State(ids[0], Filters{})
	f := mockOAuth(t, s.App)
	_, h := identityRouter(t, s.App, true)
	f.set("kakao", oauthIdentity{ID: "20001", Name: "다른 이름", Email: u.Email(), Verified: true, Modern: true})
	// A verified email match is deliberately insufficient to join accounts.
	if w := oauthRequest(t, h, "kakao", "", ""); w.Code != 409 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := oauthRequest(t, h, "kakao", "", "link"); w.Code != 403 {
		t.Fatal(w.Code)
	}
	if w := oauthRequest(t, h, "kakao", token, ""); w.Code != 403 {
		t.Fatal("implicit signed-in linking", w.Code)
	}
	id, _ := authResult(t, oauthRequest(t, h, "kakao", token, "link"))
	if id != ids[0] {
		t.Fatal("account changed")
	}
	links, _ := s.App.FindAllExternalAuthsByRecord(u)
	if w := identityRequest(t, h, "DELETE", "/api/collections/_externalAuths/records/"+links[0].Id, token, nil); w.Code != 403 {
		t.Fatal("generic unlink bypass", w.Code)
	}
	id, _ = authResult(t, oauthRequest(t, h, "kakao", token, "link"))
	if id != ids[0] {
		t.Fatal("link retry changed account")
	}
	// Even an unverified local record keeps both identities and all its fields.
	f.set("kakao", oauthIdentity{ID: "20001", Email: "changed@example.com", Verified: true})
	id, _ = authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if id != ids[0] {
		t.Fatal("stable identity lost")
	}
	afterUser, _ := s.App.FindRecordById("users", ids[0])
	providers, _ := identityProviders(s.App, afterUser)
	if encode(providers) != `["google","kakao"]` || afterUser.Email() != u.Email() || afterUser.Verified() != u.Verified() || afterUser.GetString("role") != "admin" || afterUser.GetString("name") != u.GetString("name") {
		t.Fatal("account data changed during linking")
	}
	after, _ := s.State(ids[0], Filters{})
	for _, ratings := range [][]Rating{before.Ratings, after.Ratings} {
		slices.SortFunc(ratings, func(a, b Rating) int { return strings.Compare(a.MatchID+a.PlayerID, b.MatchID+b.PlayerID) })
	}
	if encode(before) != encode(after) {
		t.Fatal("linking changed private history or ratings")
	}
	other, _ := s.App.FindRecordById("users", ids[1])
	otherToken, _ := other.NewAuthToken()
	if w := oauthRequest(t, h, "kakao", otherToken, "link"); w.Code != 409 {
		t.Fatal("stole linked identity", w.Code)
	}
	f.set("kakao", oauthIdentity{ID: "20002"})
	if w := oauthRequest(t, h, "kakao", token, "link"); w.Code != 409 {
		t.Fatal("replaced linked provider", w.Code)
	}
	u.Set("status", "suspended")
	if err := s.App.Save(u); err != nil {
		t.Fatal(err)
	}
	f.set("kakao", oauthIdentity{ID: "20001"})
	if w := oauthRequest(t, h, "kakao", "", ""); w.Code != 403 {
		t.Fatal("suspended login", w.Code)
	}
	if w := oauthRequest(t, h, "kakao", token, "link"); w.Code < 400 {
		t.Fatal("suspended link")
	}
	if w := identityRequest(t, h, "GET", "/api/kokko/me", token, nil); w.Code < 400 {
		t.Fatal("suspended me")
	}
}

func TestOAuthLinkingRecoversUnfinishedSignup(t *testing.T) {
	s, ids := setup(t)
	f := mockOAuth(t, s.App)
	_, h := identityRouter(t, s.App, false)
	pendingID, pendingToken := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	original, err := s.App.FindRecordById("users", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	token, err := original.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}

	for _, mode := range []string{"link", "link", ""} {
		auth := token
		if mode == "" {
			auth = ""
		}
		id, _ := authResult(t, oauthRequest(t, h, "kakao", auth, mode))
		if id != original.Id {
			t.Fatal("Kakao login returned a different account")
		}
	}
	providers, err := identityProviders(s.App, original)
	if err != nil || !slices.Equal(providers, []string{"google", "kakao"}) {
		t.Fatal("original account did not retain both logins", providers, err)
	}
	if _, err := s.App.FindRecordById("users", pendingID); !errors.Is(err, sql.ErrNoRows) {
		t.Fatal("unused signup still exists", err)
	}
	if w := identityRequest(t, h, "GET", "/api/kokko/me", pendingToken, nil); w.Code != 401 {
		t.Fatal("unused signup session still works", w.Code)
	}

	f.set("kakao", oauthIdentity{ID: "30001"})
	otherID, _ := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if w := oauthRequest(t, h, "kakao", token, "link"); w.Code != 409 {
		t.Fatal("another pending login replaced the linked Kakao account", w.Code)
	}
	if id, _ := authResult(t, oauthRequest(t, h, "kakao", "", "")); id != otherID {
		t.Fatal("a failed link changed the pending account")
	}
}

func TestOAuthLinkingRejectsCompletedOrSuspendedSignups(t *testing.T) {
	s, ids := setup(t)
	f := mockOAuth(t, s.App)
	registered, h := identityRouter(t, s.App, true)
	original, err := s.App.FindRecordById("users", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	token, err := original.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	activeID, _ := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if err := registered.Onboard(activeID, "이미 가입한 회원"); err != nil {
		t.Fatal(err)
	}
	if w := oauthRequest(t, h, "kakao", token, "link"); w.Code != 409 {
		t.Fatal("completed signup was taken by another account", w.Code)
	}
	if id, _ := authResult(t, oauthRequest(t, h, "kakao", "", "")); id != activeID {
		t.Fatal("completed signup lost its provider")
	}

	f.set("kakao", oauthIdentity{ID: "30002"})
	suspendedID, _ := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if err := s.Suspend(suspendedID); err != nil {
		t.Fatal(err)
	}
	if w := oauthRequest(t, h, "kakao", token, "link"); w.Code != 409 {
		t.Fatal("a suspended identity escaped suspension", w.Code)
	}
	if w := oauthRequest(t, h, "kakao", "", ""); w.Code != 403 {
		t.Fatal("suspended login was reactivated", w.Code)
	}
}

func TestOnboardingGateAndPrivateBoundary(t *testing.T) {
	s, _ := setup(t)
	f := mockOAuth(t, s.App)
	registered, h := identityRouter(t, s.App, false)
	id, token := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if w := identityRequest(t, h, "POST", "/api/kokko/onboard", token, map[string]string{"nickname": "새 회원"}); w.Code != 403 {
		t.Fatal("signup gate bypass")
	}
	registered.PublicSignup = true // Tests the enabled staging configuration.
	for _, data := range []any{map[string]string{"nickname": " "}, map[string]string{"nickname": strings.Repeat("가", 21)}, map[string]string{"nickname": "valid", "role": "admin"}} {
		if w := identityRequest(t, h, "POST", "/api/kokko/onboard", token, data); w.Code != 400 {
			t.Fatal(w.Code, w.Body.String())
		}
	}
	if w := identityRequest(t, h, "POST", "/api/kokko/onboard", token, map[string]string{"nickname": "  나의 코트  "}); w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	if w := identityRequest(t, h, "POST", "/api/kokko/onboard", token, map[string]string{"nickname": "retry overwrite"}); w.Code != 200 {
		t.Fatal(w.Code)
	}
	u, _ := s.App.FindRecordById("users", id)
	if u.GetString("status") != "active" || u.GetString("role") != "member" {
		t.Fatal("onboarding privileges")
	}
	var p Profile
	if err := s.App.DB().NewQuery("SELECT id,nickname,avatar FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": id}).One(&p); err != nil || p.Nickname != "나의 코트" {
		t.Fatal("nickname overwritten", p, err)
	}
	if groups, _ := ownGroups(s.App, id); len(groups) != 0 {
		t.Fatal("implicit private group")
	}
	for _, endpoint := range []string{"/state", "/state?group=legacy", "/invitations?group=legacy", "/matches/unknown/revisions?group=legacy"} {
		if w := identityRequest(t, h, "GET", "/api/kokko"+endpoint, token, nil); w.Code != 404 {
			t.Fatal("group boundary", endpoint, w.Code)
		}
	}
	if w := identityRequest(t, h, "PATCH", "/api/kokko/profile", token, map[string]string{"nickname": "모임 없는 회원", "avatar": ""}); w.Code != 200 {
		t.Fatal("group-free profile", w.Code)
	}
	f.set("kakao", oauthIdentity{ID: "10001", Email: "provider-change@example.com", Verified: true})
	loginID, _ := authResult(t, oauthRequest(t, h, "kakao", "", ""))
	if loginID != id {
		t.Fatal("returning ID changed")
	}
	if w := oauthRequest(t, h, "github", "", ""); w.Code != 403 {
		t.Fatal("unsupported provider", w.Code)
	}
	u.Set("status", "suspended")
	if err := s.App.Save(u); err != nil {
		t.Fatal(err)
	}
	if err := registered.Onboard(id, "reactivate"); err == nil {
		t.Fatal("reactivated suspension")
	}
}

func TestIdentityMigrationAndBackup(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ClearBootstrap() })
	var prior core.MigrationsList
	for _, m := range core.AppMigrations.Items() {
		if m.File < "1795132800_public_identity.go" {
			prior.Add(m)
		}
	}
	if _, err := core.NewMigrationsRunner(app, prior).Up(); err != nil {
		t.Fatal(err)
	}
	s := New(app)
	ids := []string{newUser(t, s, "기존 선수", "active"), newUser(t, s, "기존 상대", "active")}
	q := Mutation{RequestID: security.RandomString(24), Action: "create", Kind: "singles", Date: "2026-10-12", A: ids[:1], B: ids[1:], ScoreA: 21, ScoreB: 19}
	mustMatch(t, s, ids[0], q)
	read := func(target core.App) string {
		t.Helper()
		out := []any{}
		for _, table := range []string{"users", "_externalAuths", "kokko_profiles", "kokko_groups", "kokko_group_members", "kokko_matches", "kokko_participants", "kokko_ratings", "kokko_rating_history", "kokko_revisions", "kokko_requests", "kokko_meta"} {
			rows := []dbx.NullStringMap{}
			if err := target.DB().NewQuery("SELECT * FROM " + table + " ORDER BY rowid").All(&rows); err != nil {
				t.Fatal(err)
			}
			out = append(out, rows)
		}
		return encode(out)
	}
	before := read(app)
	if err := app.CreateBackup(context.Background(), "before-identity.zip"); err != nil {
		t.Fatal(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if read(app) != before {
		t.Fatal("identity migration rewrote accounts or rating data")
	}
	c, _ := app.FindCollectionByNameOrId("users")
	if c.Fields.GetByName("email").(*core.EmailField).Required || c.PasswordAuth.Enabled || c.AuthRule == nil || *c.AuthRule != "status != 'suspended'" {
		t.Fatal("unsafe auth schema")
	}
	archive := filepath.Join(app.DataDir(), "backups", "before-identity.zip")
	dir := filepath.Join(t.TempDir(), "restored")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	if _, err := RestoreArchive(dir, archive); err != nil {
		t.Fatal(err)
	}
	restored := core.NewBaseApp(core.BaseAppConfig{DataDir: dir})
	if err := restored.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { restored.ClearBootstrap() })
	if read(restored) != before {
		t.Fatal("backup did not restore previous source/cache data")
	}
	c, _ = restored.FindCollectionByNameOrId("users")
	if !c.Fields.GetByName("email").(*core.EmailField).Required {
		t.Fatal("backup was already migrated")
	}
	if err := restored.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if read(restored) != before {
		t.Fatal("rehearsed identity migration rewrote data")
	}
}
