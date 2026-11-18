package migrations

import (
	"fmt"
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		_, err := app.DB().NewQuery(`
ALTER TABLE kokko_rating_history ADD COLUMN before_rd REAL NOT NULL DEFAULT 350;
ALTER TABLE kokko_rating_history ADD COLUMN after_rd REAL NOT NULL DEFAULT 350;
ALTER TABLE kokko_ratings ADD COLUMN rd REAL NOT NULL DEFAULT 350;
ALTER TABLE kokko_ratings ADD COLUMN last_played TEXT NOT NULL DEFAULT '';
ALTER TABLE kokko_meta ADD COLUMN rating_system INTEGER NOT NULL DEFAULT 0;
`).Execute()
		// The service atomically replays both pools before serving any request.
		return err
	}, func(app core.App) error {
		return fmt.Errorf("rating migration cannot restore legacy Elo; restore the pre-upgrade backup with the previous image")
	})
}
