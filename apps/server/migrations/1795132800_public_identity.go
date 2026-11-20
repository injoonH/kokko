package migrations

import (
	"fmt"

	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

func init() {
	m.Register(func(app core.App) error {
		users, err := app.FindCollectionByNameOrId("users")
		if err != nil {
			return err
		}
		email, ok := users.Fields.GetByName(core.FieldNameEmail).(*core.EmailField)
		if !ok {
			return fmt.Errorf("users email field is missing")
		}
		// Stable provider IDs authenticate users; Kakao email consent is optional.
		// Preserve existing addresses, uniqueness, auth rules and record contents.
		email.Required = false
		return app.Save(users)
	}, func(core.App) error {
		return fmt.Errorf("public identity rollback requires a pre-upgrade backup and matching image")
	})
}
