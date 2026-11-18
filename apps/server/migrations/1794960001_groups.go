package migrations

import (
	"fmt"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		_, err := app.DB().NewQuery(`
CREATE TABLE kokko_groups (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('private','open')),
 created TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO kokko_groups(id,name,visibility,created,revision)
 SELECT 'legacy','우리 모임','private',strftime('%Y-%m-%dT%H:%M:%SZ','now'),revision FROM kokko_meta WHERE id=1;
CREATE TABLE kokko_group_members (
 group_id TEXT NOT NULL REFERENCES kokko_groups(id), player_id TEXT NOT NULL REFERENCES kokko_profiles(id),
 role TEXT NOT NULL CHECK(role IN ('owner','moderator','member')),
 status TEXT NOT NULL CHECK(status IN ('active','left','blocked')),
 PRIMARY KEY(group_id,player_id), CHECK(role!='owner' OR status='active')
);
CREATE UNIQUE INDEX kokko_group_owner ON kokko_group_members(group_id) WHERE role='owner';
CREATE INDEX kokko_member_groups ON kokko_group_members(player_id,status,group_id);
INSERT INTO kokko_group_members(group_id,player_id,role,status)
 SELECT 'legacy',p.id,CASE WHEN u.role='admin' THEN 'moderator' ELSE 'member' END,'active'
 FROM kokko_profiles p JOIN users u ON u.id=p.id;
UPDATE kokko_group_members SET role='owner'
 WHERE group_id='legacy' AND player_id=(
  SELECT p.id FROM kokko_profiles p JOIN users u ON u.id=p.id WHERE u.status='active'
  ORDER BY (u.role='admin') DESC,u.created,u.id LIMIT 1
 );
ALTER TABLE kokko_matches ADD COLUMN group_id TEXT REFERENCES kokko_groups(id)
 CHECK(group_id=COALESCE(json_extract(data,'$.groupId'),'legacy'));
UPDATE kokko_matches SET group_id='legacy';
CREATE TRIGGER kokko_match_group_insert BEFORE INSERT ON kokko_matches WHEN NEW.group_id IS NULL
 BEGIN SELECT RAISE(ABORT,'match group is required'); END;
CREATE TRIGGER kokko_match_group_update BEFORE UPDATE OF group_id ON kokko_matches WHEN NEW.group_id IS NULL OR NEW.group_id!=OLD.group_id
 BEGIN SELECT RAISE(ABORT,'match group is immutable'); END;
CREATE INDEX kokko_group_match_order ON kokko_matches(group_id,played_on,day_order,id);
ALTER TABLE kokko_invitations ADD COLUMN group_id TEXT REFERENCES kokko_groups(id);
UPDATE kokko_invitations SET group_id='legacy';
CREATE TRIGGER kokko_invitation_group_insert BEFORE INSERT ON kokko_invitations WHEN NEW.group_id IS NULL
 BEGIN SELECT RAISE(ABORT,'invitation group is required'); END;
CREATE TRIGGER kokko_invitation_group_update BEFORE UPDATE OF group_id ON kokko_invitations WHEN NEW.group_id IS NULL OR NEW.group_id!=OLD.group_id
 BEGIN SELECT RAISE(ABORT,'invitation group is immutable'); END;
CREATE INDEX kokko_group_invitations ON kokko_invitations(group_id,created);
CREATE TABLE kokko_group_days (
 group_id TEXT NOT NULL REFERENCES kokko_groups(id), played_on TEXT NOT NULL, version INTEGER NOT NULL,
 PRIMARY KEY(group_id,played_on)
);
INSERT INTO kokko_group_days SELECT 'legacy',played_on,version FROM kokko_days;
`).Execute()
		return err
	}, func(app core.App) error {
		return fmt.Errorf("group isolation rollback requires restoring the pre-upgrade backup with the previous image")
	})
}
