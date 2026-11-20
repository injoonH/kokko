package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/injoonH/kokko/apps/server/internal/kokko"
	_ "github.com/injoonH/kokko/apps/server/migrations"
	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/spf13/cobra"
)

func health() error {
	client := http.Client{Timeout: 3 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	url := os.Getenv("KOKKO_HEALTH_URL")
	if url == "" {
		url = "http://127.0.0.1:8080/api/health"
	}
	r, err := client.Get(url)
	if err != nil {
		return err
	}
	defer r.Body.Close()
	if r.StatusCode != 200 && r.StatusCode != 307 && r.StatusCode != 302 && r.StatusCode != 301 {
		return fmt.Errorf("health status %d", r.StatusCode)
	}
	return nil
}
func main() {
	// Offline restore deliberately runs before PocketBase opens the database.
	if len(os.Args) > 1 && os.Args[1] == "restore" {
		if len(os.Args) != 4 || os.Args[3] != "--yes" {
			log.Fatal("usage: kokko restore BACKUP.zip --yes (stop the server first)")
		}
		dir := os.Getenv("KOKKO_DATA_DIR")
		if dir == "" {
			dir = "pb_data"
		}
		archive := os.Args[2]
		if !filepath.IsAbs(archive) {
			archive = filepath.Join(dir, "backups", archive)
		}
		old, err := kokko.RestoreArchive(dir, archive)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Println("Restored. Previous data retained at:", old)
		return
	}

	// Health probes must not bootstrap another DB process or write settings.
	if len(os.Args) > 1 && os.Args[1] == "health" {
		if err := health(); err != nil {
			log.Fatal(err)
		}
		return
	}
	encryptionEnv := ""
	if os.Getenv("PB_ENCRYPTION_KEY") != "" {
		encryptionEnv = "PB_ENCRYPTION_KEY"
	}
	dataDir := os.Getenv("KOKKO_DATA_DIR")
	if dataDir == "" {
		dataDir = "pb_data"
	}
	app := pocketbase.NewWithConfig(pocketbase.Config{DefaultDataDir: dataDir, DefaultEncryptionEnv: encryptionEnv})
	public := os.Getenv("KOKKO_PUBLIC_DIR")
	if public == "" {
		public = "../web/dist"
	}
	s := kokko.Register(app, public, kokko.IdentityOptions{PublicSignup: os.Getenv("KOKKO_PUBLIC_SIGNUP") == "true"})
	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{Automigrate: false})
	app.OnServe().BindFunc(func(e *core.ServeEvent) error {
		if err := kokko.ConfigureOAuth(app, os.Getenv("GOOGLE_CLIENT_ID"), os.Getenv("GOOGLE_CLIENT_SECRET"), os.Getenv("KAKAO_CLIENT_ID"), os.Getenv("KAKAO_CLIENT_SECRET")); err != nil {
			return err
		}
		settings := app.Settings()
		settings.Meta.AppName = "kokko"
		if url := os.Getenv("KOKKO_PUBLIC_URL"); url != "" {
			settings.Meta.AppURL = url
		}
		settings.RateLimits.Enabled = true
		// PocketBase cron uses the process timezone, explicitly UTC in deployment.
		settings.Backups.Cron = "0 18 * * *"
		settings.Backups.CronMaxKeep = 30
		if err := app.Save(settings); err != nil {
			return err
		}
		return e.Next()
	})
	var inviteGroup string
	inviteCmd := &cobra.Command{Use: "invite", Short: "Create a single-use seven-day invitation (server operator only)", RunE: func(cmd *cobra.Command, args []string) error {
		if err := app.RunAllMigrations(); err != nil {
			return err
		}
		code, err := s.CreateGroupInvitation("operator", inviteGroup, true)
		if err == nil {
			fmt.Println(code)
		}
		return err
	}}
	inviteCmd.Flags().StringVar(&inviteGroup, "group", kokko.LegacyGroup, "Group to invite into")
	app.RootCmd.AddCommand(inviteCmd)
	app.RootCmd.AddCommand(&cobra.Command{Use: "group-create OWNER_ID NAME", Args: cobra.ExactArgs(2), Short: "Create a private group (stop the server first)", RunE: func(cmd *cobra.Command, args []string) error {
		if err := app.RunAllMigrations(); err != nil {
			return err
		}
		id, err := s.CreateGroup(args[1], args[0])
		if err == nil {
			fmt.Fprintln(cmd.OutOrStdout(), id)
		}
		return err
	}})
	app.RootCmd.AddCommand(&cobra.Command{Use: "group-member GROUP_ID USER_ID ROLE", Args: cobra.ExactArgs(3), Short: "Set member, moderator, left or blocked (stop the server first)", RunE: func(cmd *cobra.Command, args []string) error {
		if err := app.RunAllMigrations(); err != nil {
			return err
		}
		return s.SetGroupMember(args[0], args[1], args[2])
	}})
	app.RootCmd.AddCommand(&cobra.Command{Use: "groups", Args: cobra.NoArgs, Short: "List private groups for operator actions", RunE: func(cmd *cobra.Command, args []string) error {
		if err := app.RunAllMigrations(); err != nil {
			return err
		}
		rows := []struct {
			ID, Name, Visibility string
			Members              int
		}{}
		if err := app.DB().NewQuery(`SELECT g.id,g.name,g.visibility,COUNT(m.player_id) AS members FROM kokko_groups g LEFT JOIN kokko_group_members m ON m.group_id=g.id AND m.status='active' GROUP BY g.id ORDER BY g.created,g.id`).All(&rows); err != nil {
			return err
		}
		for _, g := range rows {
			fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\t%d\n", g.ID, g.Name, g.Visibility, g.Members)
		}
		return nil
	}})
	app.RootCmd.AddCommand(&cobra.Command{Use: "promote USER_ID", Args: cobra.ExactArgs(1), Short: "Explicitly promote an activated member", RunE: func(cmd *cobra.Command, args []string) error { return s.SetRole(args[0], "admin") }})
	app.RootCmd.AddCommand(&cobra.Command{Use: "suspend USER_ID", Args: cobra.ExactArgs(1), Short: "Suspend membership without deleting history", RunE: func(cmd *cobra.Command, args []string) error { return s.Suspend(args[0]) }})
	app.RootCmd.AddCommand(&cobra.Command{
		Use:   "rename USER_ID NICKNAME",
		Args:  cobra.ExactArgs(2),
		Short: "Change a member's display nickname (stop the server first)",
		RunE: func(cmd *cobra.Command, args []string) error {
			if err := s.RenameMember(args[0], args[1]); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "Updated nickname for %s to %q.\n", args[0], strings.TrimSpace(args[1]))
			return nil
		},
	})
	app.RootCmd.AddCommand(&cobra.Command{Use: "members", Short: "List member IDs and display nicknames for operator actions", RunE: func(cmd *cobra.Command, args []string) error {
		rows := []struct {
			ID       string `db:"id"`
			Nickname string `db:"nickname"`
			Status   string `db:"status"`
			Role     string `db:"role"`
		}{}
		if err := app.DB().NewQuery("SELECT u.id,COALESCE(p.nickname,u.name) AS nickname,u.status,u.role FROM users u LEFT JOIN kokko_profiles p ON p.id=u.id ORDER BY nickname,u.id").All(&rows); err != nil {
			return err
		}
		for _, u := range rows {
			fmt.Fprintf(cmd.OutOrStdout(), "%s\t%s\t%s\t%s\n", u.ID, u.Nickname, u.Status, u.Role)
		}
		return nil
	}})
	app.RootCmd.AddCommand(&cobra.Command{Use: "backup", Short: "Create a backup (stop the serving process first)", RunE: func(cmd *cobra.Command, args []string) error {
		name := "manual-" + time.Now().UTC().Format("20060102-150405") + ".zip"
		if err := app.CreateBackup(context.Background(), name); err != nil {
			return err
		}
		fmt.Println(name)
		return nil
	}})
	var applyRatings bool
	ratingsCmd := &cobra.Command{Use: "ratings", Args: cobra.NoArgs, Short: "Preview rating replay; --apply migrates (stop server first)", RunE: func(cmd *cobra.Command, args []string) error {
		preview, err := s.PreviewRatings()
		if err != nil {
			return err
		}
		if err = json.NewEncoder(cmd.OutOrStdout()).Encode(preview); err != nil {
			return err
		}
		if applyRatings {
			if err = app.RunAllMigrations(); err != nil {
				return err
			}
			return s.EnsureRatings()
		}
		return nil
	}}
	ratingsCmd.Flags().BoolVar(&applyRatings, "apply", false, "Apply pending schema and rating migrations after preview")
	app.RootCmd.AddCommand(ratingsCmd)
	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
