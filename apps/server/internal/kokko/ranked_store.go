package kokko

import (
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

func readRankRules(app core.App) (*rankRules, error) {
	var rules rankRules
	err := app.DB().NewQuery("SELECT start_on,version FROM kokko_rank_rules WHERE id=1").One(&rules)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if rules.Version != rankedRuleVersion {
		return nil, fmt.Errorf("unsupported ranked rules version %d", rules.Version)
	}
	return &rules, nil
}

func (s *Service) EnsureRanked() error {
	return s.App.RunInTransaction(func(app core.App) error {
		rules, err := readRankRules(app)
		if err != nil {
			return err
		}
		start := s.RankedStart
		if rules == nil {
			if start == "" {
				start = Today(s.Now().In(Seoul).AddDate(0, 0, 1))
			}
			if day, err := time.Parse(time.DateOnly, start); err != nil || day.Format(time.DateOnly) != start {
				return errors.New("KOKKO_RANKED_START must be an exact Korean date in YYYY-MM-DD form")
			}
			rules = &rankRules{StartOn: start, Version: rankedRuleVersion}
			if err := exec(app, "INSERT INTO kokko_rank_rules VALUES(1,{:on},{:version})", dbx.Params{"on": start, "version": rules.Version}); err != nil {
				return err
			}
		} else if start != "" && start != rules.StartOn {
			return fmt.Errorf("the ranked year already starts on %s; keep KOKKO_RANKED_START empty or set it to that date", rules.StartOn)
		}
		return refreshRanked(app, rules)
	})
}

// Startup reconstructs the derived ladder even after an image rollback that
// wrote new matches. It never needs to replace a Glicko row.
func refreshRanked(app core.App, rules *rankRules) error {
	if rules == nil {
		return nil
	}
	matches, err := loadMatches(app)
	if err != nil {
		return err
	}
	active, err := rankedActive(app)
	if err != nil {
		return err
	}
	for _, kind := range []string{"singles", "doubles"} {
		history, _ := Replay(matches, kind)
		if err := replaceRanked(app, kind, replayRanked(*rules, matches, history, active)); err != nil {
			return err
		}
	}
	return nil
}

func rankedActive(app core.App) (map[string]bool, error) {
	var rows []struct {
		ID string `db:"id"`
	}
	err := app.DB().NewQuery("SELECT id FROM users WHERE status='active'").All(&rows)
	active := make(map[string]bool, len(rows))
	for _, row := range rows {
		active[row.ID] = true
	}
	return active, err
}

func replaceRanked(app core.App, kind string, projection rankedProjection) error {
	for _, table := range []string{"kokko_rank_games", "kokko_rank_entries", "kokko_rank_days"} {
		if err := exec(app, "DELETE FROM "+table+" WHERE kind={:k}", dbx.Params{"k": kind}); err != nil {
			return err
		}
	}
	for _, row := range projection.Entries {
		if err := exec(app, "INSERT INTO kokko_rank_entries VALUES({:s},{:k},{:p},{:lp},{:n},{:peak})",
			dbx.Params{"s": row.Season, "k": kind, "p": row.PlayerID, "lp": row.Points, "n": row.Games, "peak": row.Peak}); err != nil {
			return err
		}
	}
	for _, row := range projection.Games {
		if err := exec(app, "INSERT INTO kokko_rank_games VALUES({:s},{:k},{:m},{:p},{:n},{:before},{:after})",
			dbx.Params{"s": row.Season, "k": kind, "m": row.MatchID, "p": row.PlayerID, "n": row.Games, "before": row.Before, "after": row.After}); err != nil {
			return err
		}
	}
	for _, day := range projection.Days {
		if err := exec(app, "INSERT INTO kokko_rank_days VALUES({:s},{:k},{:date},{:c},{:a},{:b})",
			dbx.Params{"s": day.Season, "k": kind, "date": day.Date, "c": day.Challenger, "a": day.Grandmaster[0], "b": day.Grandmaster[1]}); err != nil {
			return err
		}
	}
	return nil
}

func rebuildConfirmed(app core.App, matches []Match, kind string) error {
	history, ratings := Replay(matches, kind)
	if err := replaceRatings(app, kind, history, ratings); err != nil {
		return err
	}
	rules, err := readRankRules(app)
	if err != nil || rules == nil {
		return err
	}
	active, err := rankedActive(app)
	if err != nil {
		return err
	}
	return replaceRanked(app, kind, replayRanked(*rules, matches, history, active))
}

func rankedMatchGames(app core.App, ids []string) ([]RankedGame, error) {
	var out []RankedGame
	if len(ids) == 0 {
		return out, nil
	}
	err := app.DB().Select("match_id", "player_id", "season", "games", "before_points", "after_points").
		From("kokko_rank_games").Where(dbx.In("match_id", stringsToAny(ids)...)).
		OrderBy("match_id", "player_id").All(&out)
	return out, err
}
