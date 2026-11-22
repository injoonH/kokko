package migrations

import (
	"errors"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		_, err := app.DB().NewQuery(`
CREATE TABLE kokko_rank_rules (
 id INTEGER PRIMARY KEY CHECK(id=1), start_on TEXT NOT NULL, version INTEGER NOT NULL
);
CREATE TABLE kokko_rank_entries (
 season INTEGER NOT NULL, kind TEXT NOT NULL, player_id TEXT NOT NULL REFERENCES kokko_profiles(id),
 points INTEGER NOT NULL CHECK(points>=0), games INTEGER NOT NULL CHECK(games>0), peak INTEGER NOT NULL CHECK(peak>=0),
 PRIMARY KEY(season,kind,player_id)
);
CREATE INDEX kokko_rank_player ON kokko_rank_entries(player_id,season,kind);
CREATE TABLE kokko_rank_games (
 season INTEGER NOT NULL, kind TEXT NOT NULL, match_id TEXT NOT NULL REFERENCES kokko_matches(id),
 player_id TEXT NOT NULL REFERENCES kokko_profiles(id), games INTEGER NOT NULL,
 before_points INTEGER NOT NULL, after_points INTEGER NOT NULL,
 PRIMARY KEY(match_id,player_id)
);
CREATE INDEX kokko_rank_game_pool ON kokko_rank_games(kind);
CREATE TABLE kokko_rank_days (
 season INTEGER NOT NULL, kind TEXT NOT NULL, played_on TEXT NOT NULL,
 challenger TEXT NOT NULL, grandmaster_a TEXT NOT NULL, grandmaster_b TEXT NOT NULL,
 PRIMARY KEY(season,kind,played_on)
);
`).Execute()
		return err
	}, func(app core.App) error {
		return errors.New("ranked season history is derived from matches; use the documented backup and image rollback")
	})
}
