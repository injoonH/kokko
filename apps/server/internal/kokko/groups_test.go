package kokko

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/security"
)

// Two shared players, two legacy-only players, and two second-group players.
func twoGroups(t *testing.T) (*Service, []string, string) {
	t.Helper()
	s, ids := setup(t)
	g, err := s.CreateGroup("주말 모임", ids[0])
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{ids[1], ids[4], ids[5]} {
		if err = s.SetGroupMember(g, p, "member"); err != nil {
			t.Fatal(err)
		}
	}
	for _, p := range ids[4:] {
		if err = s.SetGroupMember(LegacyGroup, p, "left"); err != nil {
			t.Fatal(err)
		}
	}
	return s, ids, g
}
func groupGame(ids []string, group string) Mutation {
	q := create([]string{ids[0], ids[1], ids[4], ids[5]})
	q.GroupID = group
	return q
}
func groupUpdate(t *testing.T, s *Service, m Match, action string) Mutation {
	t.Helper()
	q := update(t, s, m, action)
	q.GroupID = m.GroupID
	var err error
	q.DayVersions, err = groupDayVersions(s.App, m.GroupID)
	if err != nil {
		t.Fatal(err)
	}
	return q
}

func TestGroupProjectionAndAccountRoles(t *testing.T) {
	s, ids, g := twoGroups(t)
	a := mustMatch(t, s, ids[0], create(ids))
	bq := groupGame(ids, g)
	bq.Date = "2026-10-11"
	b := mustMatch(t, s, ids[0], bq)
	// Installation administration does not grant membership or moderation.
	if err := s.SetRole(ids[2], "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.StateInGroup(ids[2], g, Filters{}); err == nil {
		t.Fatal("service admin bypassed group isolation")
	}
	state, err := s.State(ids[2], Filters{Period: "all", Player: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if state.Me.Role != "member" || state.Me.ServiceRole != "admin" || state.Group.ID != LegacyGroup {
		t.Fatal(state.Me, state.Group)
	}
	for _, secret := range []string{b.ID, ids[4], ids[5], g} {
		if strings.Contains(encode(state), secret) {
			t.Fatal("private value in legacy snapshot", secret)
		}
	}
	if len(state.AllMatches) != 1 || state.AllMatches[0].ID != a.ID || len(state.Ratings) != 4 {
		t.Fatal("unscoped history")
	}
	if _, ok := state.Days[b.Date]; ok {
		t.Fatal("foreign playing date leaked")
	}
	for _, r := range state.Rankings {
		if r.LastPlayed != "" {
			t.Fatal("global playing date leaked")
		}
	}
	other, err := s.StateInGroup(ids[0], g, Filters{Period: "all", Player: "all"})
	if err != nil {
		t.Fatal(err)
	}
	if other.Group.Role != "owner" || other.Me.Role != "admin" || other.Me.ServiceRole != "member" {
		t.Fatal("group role became account role")
	}
	if strings.Contains(encode(other), a.ID) || strings.Contains(encode(other), ids[2]) {
		t.Fatal("foreign record in second group")
	}
	if err = s.RenameGroupMemberAsAdmin(ids[0], g, ids[1], "Changed"); err == nil {
		t.Fatal("group owner renamed a global profile")
	}
	if err = s.RenameGroupMemberAsAdmin(ids[2], LegacyGroup, ids[4], "Changed"); err == nil {
		t.Fatal("service admin used unrelated group to rename")
	}
	if _, err = s.StateInGroup(ids[0], g, Filters{Player: ids[2]}); err == nil {
		t.Fatal("foreign selected player")
	}
	if err = s.SetGroupMember(g, ids[0], "left"); err == nil {
		t.Fatal("removed owner")
	}
	groups, err := ownGroups(s.App, ids[2])
	if err != nil || len(groups) != 1 || groups[0].ID != LegacyGroup {
		t.Fatal(groups, err)
	}
}

func TestGroupMutationsAndRevokedRetries(t *testing.T) {
	s, ids, g := twoGroups(t)
	legacy := mustMatch(t, s, ids[0], create(ids))
	q := groupGame(ids, g)
	if _, err := s.Mutate(ids[2], q); err == nil {
		t.Fatal("nonmember mutation")
	}
	bad := q
	bad.B = []string{ids[2], ids[5]}
	bad.RequestID = security.RandomString(24)
	if _, err := s.Mutate(ids[0], bad); err == nil {
		t.Fatal("foreign participant")
	}
	b := mustMatch(t, s, ids[1], q)
	wrong := groupUpdate(t, s, legacy, "edit")
	wrong.GroupID = g
	if _, err := s.Mutate(ids[0], wrong); err == nil {
		t.Fatal("match moved between groups")
	}
	// A group owner can moderate another author's match without service admin.
	deleted := mustMatch(t, s, ids[0], groupUpdate(t, s, b, "delete"))
	if _, err := s.Mutate(ids[1], groupUpdate(t, s, deleted, "restore")); err == nil {
		t.Fatal("ordinary member restored")
	}
	mustMatch(t, s, ids[0], groupUpdate(t, s, deleted, "restore"))
	if _, err := s.Revisions(ids[0], LegacyGroup, b.ID); err == nil {
		t.Fatal("wrong-context audit")
	}
	if _, err := s.Revisions(ids[1], g, b.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.SetGroupMember(g, ids[1], "left"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Mutate(ids[1], q); err == nil {
		t.Fatal("cached retry bypassed revoked membership")
	}
	if _, err := s.Revisions(ids[1], g, b.ID); err == nil {
		t.Fatal("former author read audit")
	}
	state, err := s.StateInGroup(ids[0], g, Filters{Period: "all"})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range state.Profiles {
		if p.ID == ids[1] && p.Status != "left" {
			t.Fatal("former participant remains selectable")
		}
	}
	for _, r := range state.Rankings {
		if r.PlayerID == ids[1] && r.Rank != 0 {
			t.Fatal("former member still ranked")
		}
	}
	for _, m := range state.AllMatches {
		if m.ID == b.ID {
			mustMatch(t, s, ids[0], groupUpdate(t, s, m, "delete"))
		}
	}
	ordinary, err := s.StateInGroup(ids[4], g, Filters{})
	if err != nil {
		t.Fatal(err)
	}
	for _, p := range ordinary.Profiles {
		if p.ID == ids[1] {
			t.Fatal("deleted-only former participant leaked to ordinary member")
		}
	}
	owner, err := s.StateInGroup(ids[0], g, Filters{})
	if err != nil || len(owner.Deleted) != 1 {
		t.Fatal("owner cannot recover deleted game", err)
	}
	assertReplay(t, s)
}

func TestGlobalReplayWithLocalGroupOrder(t *testing.T) {
	s, ids, g := twoGroups(t)
	a1 := mustMatch(t, s, ids[0], create(ids))
	b1 := mustMatch(t, s, ids[0], groupGame(ids, g))
	a2 := mustMatch(t, s, ids[0], create(ids))
	b2 := mustMatch(t, s, ids[0], groupGame(ids, g))
	if a1.Order != 1 || a2.Order != 2 || b1.Order != 1 || b2.Order != 2 {
		t.Fatal("exposed global positions")
	}
	before, _ := s.StateInGroup(ids[0], g, Filters{Period: "all"})
	ms, _ := loadMatches(s.App)
	if ms[0].ID != a1.ID || ms[1].ID != b1.ID || ms[2].ID != a2.ID || ms[3].ID != b2.ID {
		t.Fatal("global append order")
	}
	q := groupUpdate(t, s, a1, "edit")
	q.ScoreA, q.ScoreB = 10, 21
	q.Position = 1
	a1 = mustMatch(t, s, ids[0], q)
	ms, _ = loadMatches(s.App)
	if ms[0].ID != a1.ID || ms[1].ID != b1.ID || ms[2].ID != a2.ID {
		t.Fatal("ordinary edit changed canonical slot")
	}
	after, _ := s.StateInGroup(ids[0], g, Filters{Period: "all"})
	if reflect.DeepEqual(before.Ratings, after.Ratings) {
		t.Fatal("correction did not replay later group")
	}
	if !reflect.DeepEqual(before.Days, after.Days) || before.Revision != after.Revision {
		t.Fatal("foreign ordering metadata leaked")
	}
	// Another group's edit does not invalidate this group's local placement.
	bq := groupUpdate(t, s, b1, "edit")
	bq.DayVersions = before.Days
	b1 = mustMatch(t, s, ids[0], bq)
	move := groupUpdate(t, s, a2, "move")
	move.Position = 1
	mustMatch(t, s, ids[0], move)
	ms, _ = loadMatches(s.App)
	if ms[0].ID != a2.ID || ms[1].ID != a1.ID || ms[2].ID != b1.ID || ms[3].ID != b2.ID {
		t.Fatal("local anchor mapping", ms)
	}
	state, _ := s.StateInGroup(ids[0], g, Filters{Period: "all"})
	for _, m := range state.AllMatches {
		if m.ID == b1.ID && m.Order != 1 || m.ID == b2.ID && m.Order != 2 {
			t.Fatal("foreign move changed local order")
		}
	}
	var sum float64
	for _, r := range state.Ratings {
		if r.PlayerID == ids[0] {
			sum += r.Delta
		}
	}
	if state.Stats.Change != sum {
		t.Fatal("period change includes hidden-group games")
	}
	if state.Stats.Points[0].Date != state.Stats.Points[1].Date {
		t.Fatal("baseline predates the sampled rating")
	}
	for _, r := range state.Rankings {
		if r.PlayerID == ids[0] && r.Games != 4 {
			t.Fatal("global rating reset between groups")
		}
	}
	revs, err := s.Revisions(ids[0], g, b2.ID)
	if err != nil {
		t.Fatal(err)
	}
	var snapshot Match
	if err = json.Unmarshal([]byte(revs[0].After), &snapshot); err != nil || snapshot.Order != 2 {
		t.Fatal("audit exposed canonical position", snapshot, err)
	}
	assertReplay(t, s)
}

func TestGroupInvitationsAndAccountPreservation(t *testing.T) {
	s, ids, g := twoGroups(t)
	if _, err := s.CreateGroupInvitation(ids[0], LegacyGroup, false); err == nil {
		t.Fatal("ordinary member issued legacy invite")
	}
	code, err := s.CreateGroupInvitation(ids[0], g, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.SetRole(ids[2], "admin"); err != nil {
		t.Fatal(err)
	}
	if _, err = s.GroupInvitations(ids[2], g); err == nil {
		t.Fatal("service admin listed private invites")
	}
	if err = s.Redeem(ids[2], code); err != nil {
		t.Fatal(err)
	}
	u, _ := s.App.FindRecordById("users", ids[2])
	if u.GetString("role") != "admin" {
		t.Fatal("joining reset service privileges")
	}
	state, err := s.StateInGroup(ids[2], g, Filters{})
	if err != nil || state.Group.Role != "member" || state.Me.Role != "member" {
		t.Fatal("joining elevated group role", err)
	}
	if err = s.Redeem(ids[2], code); err != nil {
		t.Fatal("same-member redeem retry", err)
	}
	if err = s.SetGroupMember(g, ids[2], "blocked"); err != nil {
		t.Fatal(err)
	}
	code, err = s.CreateGroupInvitation(ids[0], g, false)
	if err != nil {
		t.Fatal(err)
	}
	if err = s.Redeem(ids[2], code); err == nil {
		t.Fatal("invitation bypassed block")
	}
	invites, err := s.GroupInvitations(ids[0], g)
	if err != nil {
		t.Fatal(err)
	}
	for _, i := range invites {
		if i.GroupID != g {
			t.Fatal("unscoped invite")
		}
	}
	if err = s.SetGroupMember(LegacyGroup, ids[0], "moderator"); err != nil {
		t.Fatal(err)
	}
	if err = s.DisableGroupInvitation(ids[0], LegacyGroup, invites[0].ID); err == nil {
		t.Fatal("disabled another group's invitation")
	}
	pending := newUser(t, s, "신규 참가자", "pending")
	if err = s.Redeem(pending, code); err != nil {
		t.Fatal(err)
	}
	if _, err = s.State(pending, Filters{}); err == nil {
		t.Fatal("joining second group exposed legacy history")
	}
	if _, err = s.StateInGroup(pending, g, Filters{}); err != nil {
		t.Fatal(err)
	}
}

func TestGroupHTTPUsesCurrentMembership(t *testing.T) {
	s, ids, g := twoGroups(t)
	q := groupGame(ids, g)
	m := mustMatch(t, s, ids[1], q)
	if err := s.SetGroupMember(g, ids[1], "moderator"); err != nil {
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
	u, _ := s.App.FindRecordById("users", ids[1])
	token, err := u.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	request := func(method, path string, payload any) int {
		t.Helper()
		r := httptest.NewRequest(method, path, bytes.NewBufferString(encode(payload)))
		r.Header.Set("Authorization", token)
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w.Code
	}
	if status := request("GET", "/api/kokko/invitations?group="+g, nil); status != 200 {
		t.Fatal(status)
	}
	if err = s.SetGroupMember(g, ids[1], "member"); err != nil {
		t.Fatal(err)
	}
	if status := request("GET", "/api/kokko/invitations?group="+g, nil); status != 403 {
		t.Fatal("stale group role accepted", status)
	}
	bad := q
	bad.GroupID = LegacyGroup
	if status := request("POST", "/api/kokko/matches?group="+g, bad); status != 400 {
		t.Fatal("mismatched group", status)
	}
	if err = s.SetGroupMember(g, ids[1], "left"); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"/api/kokko/state?group=" + g, "/api/kokko/matches/" + m.ID + "/revisions?group=" + g, "/api/kokko/invitations?group=" + g} {
		if status := request("GET", path, nil); status != 404 {
			t.Fatal("removed membership accepted", path, status)
		}
	}
	if status := request("POST", "/api/kokko/matches?group="+g, q); status != 404 {
		t.Fatal("revoked cached request accepted", status)
	}
}

func TestGroupMigrationRetainsLegacyDataAndRecovery(t *testing.T) {
	app := core.NewBaseApp(core.BaseAppConfig{DataDir: t.TempDir()})
	if err := app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { app.ClearBootstrap() })
	var prior core.MigrationsList
	for _, m := range core.AppMigrations.Items() {
		if m.File < "1794960001_groups.go" {
			prior.Add(m)
		}
	}
	if _, err := core.NewMigrationsRunner(app, prior).Up(); err != nil {
		t.Fatal(err)
	}
	s := New(app)
	ids := []string{newUser(t, s, "원래 회원", "active"), newUser(t, s, "기존 관리자", "active")}
	if err := s.SetRole(ids[1], "admin"); err != nil {
		t.Fatal(err)
	}
	q := Mutation{RequestID: security.RandomString(24), Action: "create", Kind: "singles", Date: "2026-10-12", A: ids[:1], B: ids[1:], ScoreA: 21, ScoreB: 19}
	m := Match{ID: "old-match", Kind: q.Kind, Date: q.Date, Order: 1, A: q.A, B: q.B, ScoreA: 21, ScoreB: 19, Author: ids[0], Version: 7, Created: "original", Updated: "original"}
	if err := exec(app, "INSERT INTO kokko_matches VALUES({:id},{:date},1,'singles',{:data})", dbx.Params{"id": m.ID, "date": m.Date, "data": encode(m)}); err != nil {
		t.Fatal(err)
	}
	if err := rebuild(app, []Match{m}, "singles"); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"INSERT INTO kokko_days VALUES('2026-10-12',9)", "UPDATE kokko_meta SET rating_system=1,revision=12"} {
		if err := exec(app, query, nil); err != nil {
			t.Fatal(err)
		}
	}
	if err := exec(app, "INSERT INTO kokko_requests VALUES({:a},{:r},{:h},{:v})", dbx.Params{"a": ids[0], "r": q.RequestID, "h": hash(encode(q)), "v": encode(m)}); err != nil {
		t.Fatal(err)
	}
	if err := exec(app, "INSERT INTO kokko_revisions VALUES('old-audit',{:m},{:a},'create','original','{}',{:v})", dbx.Params{"m": m.ID, "a": ids[0], "v": encode(m)}); err != nil {
		t.Fatal(err)
	}
	if err := exec(app, "INSERT INTO kokko_participants VALUES({:m},{:a},'A',0),({:m},{:b},'B',0)", dbx.Params{"m": m.ID, "a": ids[0], "b": ids[1]}); err != nil {
		t.Fatal(err)
	}
	code := security.RandomString(32)
	if err := exec(app, "INSERT INTO kokko_invitations(id,hash,created_by,created,expires) VALUES('old-invite',{:h},'operator','2026-10-12T00:00:00Z','2099-01-01T00:00:00Z')", dbx.Params{"h": hash(code)}); err != nil {
		t.Fatal(err)
	}
	queries := []string{"SELECT id,played_on,day_order,kind,data FROM kokko_matches", "SELECT * FROM kokko_rating_history", "SELECT * FROM kokko_ratings", "SELECT * FROM kokko_requests", "SELECT * FROM kokko_revisions", "SELECT * FROM kokko_participants", "SELECT * FROM kokko_profiles", "SELECT * FROM users"}
	read := func() []string {
		t.Helper()
		out := []string{}
		for _, query := range queries {
			rows := []dbx.NullStringMap{}
			if err := app.DB().NewQuery(query).All(&rows); err != nil {
				t.Fatal(err)
			}
			out = append(out, encode(rows))
		}
		return out
	}
	before := read()
	if err := app.CreateBackup(context.Background(), "before-groups.zip"); err != nil {
		t.Fatal(err)
	}
	if err := app.RunAllMigrations(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, read()) {
		t.Fatal("migration rewrote legacy source or rating caches")
	}
	g, err := groupMember(app, ids[1], LegacyGroup)
	if err != nil || g.Role != "owner" || g.Visibility != "private" || g.Revision != 12 {
		t.Fatal(g, err)
	}
	versions, err := groupDayVersions(app, LegacyGroup)
	if err != nil || versions[m.Date] != 9 {
		t.Fatal(versions, err)
	}
	retry, err := s.Mutate(ids[0], q)
	if err != nil || retry.ID != m.ID || retry.GroupID != LegacyGroup {
		t.Fatal("old retry hash incompatible", retry, err)
	}
	for _, query := range []string{"UPDATE kokko_matches SET group_id=NULL", "UPDATE kokko_invitations SET group_id=NULL", "UPDATE kokko_matches SET group_id='missing'"} {
		if err = exec(app, query, nil); err == nil {
			t.Fatal("accepted invalid group", query)
		}
	}
	if !reflect.DeepEqual(before, read()) {
		t.Fatal("compatibility retry or rejected edits changed data")
	}
	// Restore the real archive with no application migrations: the prior image
	// can open exactly its old schema/data, while restored copies remain retained.
	dir := app.DataDir()
	app.ClearBootstrap()
	if _, err = RestoreArchive(dir, filepath.Join(dir, "backups", "before-groups.zip")); err != nil {
		t.Fatal(err)
	}
	if err = app.Bootstrap(); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(before, read()) {
		t.Fatal("recovery lost prior data")
	}
	var count struct {
		N int `db:"n"`
	}
	if err = app.DB().NewQuery("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='kokko_groups'").One(&count); err != nil || count.N != 0 {
		t.Fatal("recovery retained new schema", count, err)
	}
}
