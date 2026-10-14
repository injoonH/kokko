package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

func init() {
	m.Register(func(app core.App) error {
		users, findErr := app.FindCollectionByNameOrId("users")
		if findErr != nil {
			users = core.NewAuthCollection("users")
		}
		users.ListRule = nil
		users.ViewRule = nil
		users.CreateRule = types.Pointer("@request.context = 'oauth2'")
		users.UpdateRule = nil
		users.DeleteRule = nil
		users.ManageRule = nil
		users.PasswordAuth.Enabled = false
		users.AuthAlert.Enabled = false
		users.AuthRule = types.Pointer("status != 'suspended'")
		users.Fields.Add(&core.TextField{Name: "name", Max: 80}, &core.SelectField{Name: "status", Values: []string{"pending", "active", "suspended"}, MaxSelect: 1}, &core.SelectField{Name: "role", Values: []string{"member", "admin"}, MaxSelect: 1})
		if err := app.Save(users); err != nil {
			return err
		}
		_, err := app.DB().NewQuery(`
CREATE TABLE kokko_profiles (id TEXT PRIMARY KEY REFERENCES users(id), nickname TEXT NOT NULL, avatar TEXT NOT NULL DEFAULT '');
CREATE TABLE kokko_invitations (id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, created_by TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0, redeemed_by TEXT NOT NULL DEFAULT '', redeemed_at TEXT NOT NULL DEFAULT '');
CREATE TABLE kokko_matches (id TEXT PRIMARY KEY, played_on TEXT NOT NULL, day_order INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('singles','doubles')), data TEXT NOT NULL);
CREATE INDEX kokko_match_order ON kokko_matches(played_on, day_order, id);
CREATE TABLE kokko_participants (match_id TEXT NOT NULL REFERENCES kokko_matches(id), player_id TEXT NOT NULL REFERENCES kokko_profiles(id), team TEXT NOT NULL, slot INTEGER NOT NULL, PRIMARY KEY(match_id,player_id), UNIQUE(match_id,team,slot));
CREATE TABLE kokko_rating_history (match_id TEXT NOT NULL REFERENCES kokko_matches(id), player_id TEXT NOT NULL REFERENCES kokko_profiles(id), kind TEXT NOT NULL, before REAL NOT NULL, after REAL NOT NULL, delta REAL NOT NULL, expected REAL NOT NULL, PRIMARY KEY(match_id,player_id));
CREATE TABLE kokko_ratings (player_id TEXT NOT NULL REFERENCES kokko_profiles(id), kind TEXT NOT NULL, rating REAL NOT NULL, games INTEGER NOT NULL, PRIMARY KEY(player_id,kind));
CREATE TABLE kokko_revisions (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES kokko_matches(id), actor TEXT NOT NULL, action TEXT NOT NULL, created TEXT NOT NULL, before TEXT NOT NULL, after TEXT NOT NULL);
CREATE TABLE kokko_requests (actor TEXT NOT NULL, request_id TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(actor,request_id));
CREATE TABLE kokko_days (played_on TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE kokko_meta (id INTEGER PRIMARY KEY, revision INTEGER NOT NULL);
INSERT INTO kokko_meta VALUES(1,0);
`).Execute()
		return err
	}, func(app core.App) error {
		// Explicitly destructive rollback. Production recovery uses a verified backup.
		_, err := app.DB().NewQuery(`DROP TABLE kokko_requests; DROP TABLE kokko_revisions; DROP TABLE kokko_rating_history; DROP TABLE kokko_ratings; DROP TABLE kokko_participants; DROP TABLE kokko_matches; DROP TABLE kokko_invitations; DROP TABLE kokko_profiles; DROP TABLE kokko_days; DROP TABLE kokko_meta;`).Execute()
		if err != nil {
			return err
		}
		c, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		return app.Delete(c)
	})
}
