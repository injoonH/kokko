package kokko

import (
	"bytes"
	"encoding/json"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func TestRenameMemberPreservesProfileAndHistory(t *testing.T) {
	s, ids := setup(t)
	mustMatch(t, s, ids[0], create(ids))
	if err := exec(s.App, "UPDATE kokko_profiles SET avatar={:a} WHERE id={:id}", dbx.Params{"a": "existing-avatar", "id": ids[1]}); err != nil {
		t.Fatal(err)
	}
	before, err := s.State(ids[0], Filters{Period: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if err = s.RenameMember(ids[1], "  O'Neil 🏸  "); err != nil {
		t.Fatal(err)
	}
	after, err := s.State(ids[0], Filters{Period: "all"})
	if err != nil {
		t.Fatal(err)
	}
	profiles := map[string]Profile{}
	for _, p := range after.Profiles {
		profiles[p.ID] = p
	}
	if p := profiles[ids[1]]; p.Nickname != "O'Neil 🏸" || p.Avatar != "existing-avatar" {
		t.Fatalf("unexpected renamed profile: %+v", p)
	}
	for _, p := range before.Profiles {
		if p.ID != ids[1] && profiles[p.ID] != p {
			t.Fatalf("another profile changed: %s", p.ID)
		}
	}
	if !reflect.DeepEqual(before.AllMatches, after.AllMatches) || !reflect.DeepEqual(before.Ratings, after.Ratings) || !reflect.DeepEqual(before.Rankings, after.Rankings) {
		t.Fatal("renaming changed match or rating history")
	}
	if after.Revision != before.Revision+1 {
		t.Fatal("nickname change did not advance the state revision")
	}
	u, err := s.App.FindRecordById("users", ids[1])
	if err != nil {
		t.Fatal(err)
	}
	if u.GetString("name") != "선수1" || u.GetString("status") != "active" || u.GetString("role") != "member" {
		t.Fatal("renaming changed the Google name or account privileges")
	}
}

func TestRenameMemberValidationAndMissingProfiles(t *testing.T) {
	s, ids := setup(t)
	for _, nickname := range []string{"", " \t\n ", strings.Repeat("a", 21), strings.Repeat("가", 21), string([]byte{0xff})} {
		if err := s.RenameMember(ids[1], nickname); err == nil {
			t.Fatalf("accepted invalid nickname: %q", nickname)
		}
	}
	pending := newUser(t, s, "아직 가입 전", "pending")
	for _, id := range []string{"missing", pending, ids[1] + "' OR 1=1 --"} {
		if err := s.RenameMember(id, "다른 이름"); err == nil {
			t.Fatalf("accepted missing profile: %q", id)
		}
	}
	state, err := s.State(ids[0], Filters{})
	if err != nil {
		t.Fatal(err)
	}
	if state.Revision != 0 {
		t.Fatal("failed renames changed the state revision")
	}
	for _, p := range state.Profiles {
		if p.ID == ids[1] && p.Nickname != "선수1" {
			t.Fatal("failed renames changed the nickname")
		}
	}
	// Limits count Unicode characters rather than bytes, including emoji.
	for _, nickname := range []string{"가", strings.Repeat("가", 20), strings.Repeat("🏸", 20)} {
		if err := s.RenameMember(ids[1], nickname); err != nil {
			t.Fatalf("rejected valid nickname %q: %v", nickname, err)
		}
	}
}

func TestRenameSuspendedMember(t *testing.T) {
	s, ids := setup(t)
	if err := s.Suspend(ids[1]); err != nil {
		t.Fatal(err)
	}
	if err := s.RenameMember(ids[1], "새 닉네임"); err != nil {
		t.Fatal(err)
	}
	u, err := s.App.FindRecordById("users", ids[1])
	if err != nil || u.GetString("status") != "suspended" {
		t.Fatal("renaming reactivated the suspended member")
	}
	var nickname string
	if err = s.App.DB().NewQuery("SELECT nickname FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": ids[1]}).Row(&nickname); err != nil {
		t.Fatal(err)
	}
	if nickname != "새 닉네임" {
		t.Fatal("suspended member nickname was not updated")
	}
}

func TestAdminNicknameHTTP(t *testing.T) {
	s, ids := setup(t)
	mustMatch(t, s, ids[0], create(ids))
	if err := s.SetRole(ids[0], "admin"); err != nil {
		t.Fatal(err)
	}
	if err := exec(s.App, "UPDATE kokko_profiles SET avatar='keep-avatar' WHERE id={:id}", dbx.Params{"id": ids[1]}); err != nil {
		t.Fatal(err)
	}
	pending := newUser(t, s, "가입 대기", "pending")
	if err := s.SetRole(ids[4], "admin"); err != nil {
		t.Fatal(err)
	}
	if err := s.Suspend(ids[4]); err != nil {
		t.Fatal(err)
	}
	Register(s.App, t.TempDir())
	router, err := apis.NewRouter(s.App)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.App.OnServe().Trigger(&core.ServeEvent{App: s.App, Router: router}); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	tokens := map[string]string{}
	request := func(actor, target, payload string) *httptest.ResponseRecorder {
		t.Helper()
		r := httptest.NewRequest("PATCH", "/api/kokko/members/"+target+"/nickname", bytes.NewBufferString(payload))
		r.Header.Set("Content-Type", "application/json")
		if actor != "" {
			if tokens[actor] == "" {
				u, err := s.App.FindRecordById("users", actor)
				if err != nil {
					t.Fatal(err)
				}
				tokens[actor], err = u.NewAuthToken()
				if err != nil {
					t.Fatal(err)
				}
			}
			r.Header.Set("Authorization", tokens[actor])
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}
	before, err := s.State(ids[0], Filters{Period: "all"})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		actor, target, payload string
		status                 int
	}{
		{"", ids[1], `{"nickname":"변경"}`, 401},
		{ids[2], ids[1], `{"nickname":"변경"}`, 403},
		{ids[2], ids[2], `{"nickname":"변경"}`, 403},
		{pending, ids[1], `{"nickname":"변경"}`, 403},
		{ids[4], ids[1], `{"nickname":"변경"}`, 403},
		{ids[0], "missing", `{"nickname":"변경"}`, 404},
		{ids[0], pending, `{"nickname":"변경"}`, 404},
		{ids[0], ids[1], `{"nickname":"  "}`, 400},
		{ids[0], ids[1], `{"nickname":"abcdefghijklmnopqrstu"}`, 400},
		{ids[0], ids[1], `{"nickname":12}`, 400},
		{ids[0], ids[1], `{"nickname":"변경","role":"admin"}`, 400},
		{ids[0], ids[1], `{"nickname":"변경","avatar":"overwrite"}`, 400},
	} {
		w := request(tc.actor, tc.target, tc.payload)
		if w.Code != tc.status {
			t.Fatalf("rename status %d, want %d: %s", w.Code, tc.status, w.Body.String())
		}
	}
	after, err := s.State(ids[0], Filters{Period: "all"})
	if err != nil || !reflect.DeepEqual(before, after) {
		t.Fatal("failed admin renames changed state", err)
	}
	w := request(ids[0], ids[1], `{"nickname":"  O'Neil 🏸  "}`)
	if w.Code != 200 {
		t.Fatal(w.Code, w.Body.String())
	}
	var result struct {
		OK bool `json:"ok"`
	}
	if err = json.Unmarshal(w.Body.Bytes(), &result); err != nil || !result.OK {
		t.Fatal("missing success response", err)
	}
	after, err = s.State(ids[0], Filters{Period: "all"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range after.Profiles {
		if p.ID == ids[1] && (p.Nickname != "O'Neil 🏸" || p.Avatar != "keep-avatar") {
			t.Fatal("nickname or avatar was not preserved", p)
		}
	}
	if after.Revision != before.Revision+1 || !reflect.DeepEqual(before.AllMatches, after.AllMatches) || !reflect.DeepEqual(before.Ratings, after.Ratings) || !reflect.DeepEqual(before.Rankings, after.Rankings) {
		t.Fatal("admin rename changed match history or did not advance revision")
	}
	u, err := s.App.FindRecordById("users", ids[1])
	if err != nil || u.GetString("name") != "선수1" || u.GetString("role") != "member" || u.GetString("status") != "active" {
		t.Fatal("admin rename changed the auth account", err)
	}
	if err = s.Suspend(ids[1]); err != nil {
		t.Fatal(err)
	}
	if w = request(ids[0], ids[1], `{"nickname":"이용 중지 회원"}`); w.Code != 200 {
		t.Fatal("admin could not rename a suspended profile", w.Code, w.Body.String())
	}
	u, err = s.App.FindRecordById("users", ids[1])
	if err != nil || u.GetString("status") != "suspended" {
		t.Fatal("admin rename reactivated a member", err)
	}
	// The cached token was issued while this member was an administrator.
	if err = s.SetRole(ids[0], "member"); err != nil {
		t.Fatal(err)
	}
	if w = request(ids[0], ids[1], `{"nickname":"권한 없음"}`); w.Code != 403 {
		t.Fatal("a previously issued admin token bypassed current permissions", w.Code)
	}
}
