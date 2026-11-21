package migrations

import (
	"fmt"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/security"
)

func init() {
	m.Register(func(app core.App) error {
		_, err := app.DB().NewQuery(`
CREATE TABLE kokko_player_handles (player_id TEXT PRIMARY KEY REFERENCES kokko_profiles(id), handle TEXT NOT NULL COLLATE NOCASE UNIQUE);
CREATE TABLE kokko_friendships (a TEXT NOT NULL REFERENCES kokko_profiles(id), b TEXT NOT NULL REFERENCES kokko_profiles(id), requested_by TEXT NOT NULL REFERENCES kokko_profiles(id), status TEXT NOT NULL CHECK(status IN ('pending','friends')), version INTEGER NOT NULL DEFAULT 1, CHECK(a<b), PRIMARY KEY(a,b));
CREATE INDEX kokko_friends_b ON kokko_friendships(b,status);
CREATE TABLE kokko_blocks (actor TEXT NOT NULL REFERENCES kokko_profiles(id), target TEXT NOT NULL REFERENCES kokko_profiles(id), CHECK(actor!=target), PRIMARY KEY(actor,target));
CREATE INDEX kokko_blocks_target ON kokko_blocks(target,actor);
CREATE TABLE kokko_arena_days (played_on TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0);
INSERT INTO kokko_arena_days SELECT played_on,MAX(version) FROM kokko_group_days GROUP BY played_on;
CREATE TABLE kokko_arena_slots (id TEXT PRIMARY KEY, played_on TEXT NOT NULL, position INTEGER NOT NULL);
CREATE INDEX kokko_arena_slot_order ON kokko_arena_slots(played_on,position,id);
INSERT INTO kokko_arena_slots SELECT id,played_on,day_order FROM kokko_matches;
CREATE TABLE kokko_proposals (id TEXT PRIMARY KEY, match_id TEXT NOT NULL, actor TEXT NOT NULL REFERENCES kokko_profiles(id), action TEXT NOT NULL CHECK(action IN ('create','edit','move','delete','restore')), base_version INTEGER NOT NULL, version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','rejected','cancelled','superseded')), payload TEXT NOT NULL, reserved INTEGER NOT NULL DEFAULT 0, confirmed_by TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, resolved TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX kokko_pending_match ON kokko_proposals(match_id) WHERE status='pending';
CREATE INDEX kokko_proposal_inbox ON kokko_proposals(status,created,id);
CREATE TABLE kokko_arena_requests (actor TEXT NOT NULL, request_id TEXT NOT NULL, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY(actor,request_id));
CREATE TABLE kokko_match_reports (id TEXT PRIMARY KEY, match_id TEXT NOT NULL REFERENCES kokko_matches(id), actor TEXT NOT NULL REFERENCES kokko_profiles(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created TEXT NOT NULL, resolved_by TEXT NOT NULL DEFAULT '', resolution TEXT NOT NULL DEFAULT '');
CREATE UNIQUE INDEX kokko_open_report ON kokko_match_reports(match_id,actor) WHERE status='open';
CREATE TABLE kokko_voids (match_id TEXT PRIMARY KEY REFERENCES kokko_matches(id), actor TEXT NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX kokko_public_player_history ON kokko_participants(player_id,match_id);
CREATE INDEX kokko_global_rating_order ON kokko_ratings(kind,rating DESC,player_id);
CREATE INDEX kokko_global_display_rating ON kokko_ratings(kind,ROUND(rating) DESC,player_id);
`).Execute()
		if err != nil {
			return err
		}
		var rows []struct {
			ID string `db:"id"`
		}
		if err := app.DB().NewQuery("SELECT id FROM kokko_profiles ORDER BY id").All(&rows); err != nil {
			return err
		}
		for _, row := range rows {
			for {
				handle := strings.ToLower(security.RandomString(6))
				var n struct {
					N int `db:"n"`
				}
				if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_player_handles WHERE handle={:h}").Bind(dbx.Params{"h": handle}).One(&n); err != nil {
					return err
				}
				if n.N != 0 {
					continue
				}
				if _, err := app.DB().NewQuery("INSERT INTO kokko_player_handles VALUES({:id},{:h})").Bind(dbx.Params{"id": row.ID, "h": handle}).Execute(); err != nil {
					return err
				}
				break
			}
		}
		return nil
	}, func(core.App) error {
		return fmt.Errorf("public-player rollback requires the pre-upgrade backup and matching image")
	})
}
