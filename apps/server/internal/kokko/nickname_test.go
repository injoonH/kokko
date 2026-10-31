package kokko

import (
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
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
