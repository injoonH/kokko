package kokko

import (
	"math"
	"slices"
	"strings"
	"time"
)

const (
	rankedRuleVersion = 1
	placementGames    = 5
	divisionLP        = 100
	tierLP            = 4 * divisionLP
	masterLP          = 7 * tierLP
	grandmasterLP     = masterLP + 400
	challengerLP      = masterLP + 800
)

var rankedTiers = [...]string{"iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "grandmaster", "challenger"}

type rankRules struct {
	StartOn string `db:"start_on"`
	Version int    `db:"version"`
}

type RankedYear struct {
	Number         int    `json:"number"`
	StartsOn       string `json:"startsOn"`
	EndsBefore     string `json:"endsBefore"`
	Active         bool   `json:"active"`
	PlacementGames int    `json:"placementGames"`
}

func (rules rankRules) year(date string) RankedYear {
	start, _ := time.Parse(time.DateOnly, rules.StartOn)
	number := 1
	for date >= start.AddDate(number, 0, 0).Format(time.DateOnly) {
		number++
	}
	return RankedYear{
		Number: number, StartsOn: start.AddDate(number-1, 0, 0).Format(time.DateOnly),
		EndsBefore: start.AddDate(number, 0, 0).Format(time.DateOnly),
		Active:     date >= rules.StartOn, PlacementGames: placementGames,
	}
}

type ladderEntry struct {
	PlayerID   string `db:"player_id"`
	Season     int    `db:"season"`
	Points     int    `db:"points"`
	Games      int    `db:"games"`
	Peak       int    `db:"peak"`
	Shield     bool
	LastRating float64
}

type RankedGame struct {
	MatchID  string `db:"match_id" json:"matchId"`
	PlayerID string `db:"player_id" json:"playerId"`
	Season   int    `db:"season" json:"season"`
	Games    int    `db:"games" json:"games"`
	Before   int    `db:"before_points" json:"before"`
	After    int    `db:"after_points" json:"after"`
}

type rankedDay struct {
	Season      int
	Date        string
	Challenger  string
	Grandmaster [2]string
}

type rankedProjection struct {
	Entries []ladderEntry
	Games   []RankedGame
	Days    []rankedDay
}

func placementCap(season int) int {
	if season == 1 {
		return 4 * tierLP // Platinum IV
	}
	return 6*tierLP + divisionLP // Diamond III
}

func glickoRankTarget(elo float64) float64 { return (elo - 700) * 4 }

func placementSeed(r Rating, season int, previous ladderEntry) int {
	reliable := glickoRankTarget(r.Before) - tierLP - math.Max(0, r.BeforeRD-80)*3
	if previous.Games >= placementGames && previous.Season == season-1 {
		reliable = (reliable + float64(previous.Points-tierLP)) / 2
	}
	seed := int(math.Floor(reliable/divisionLP)) * divisionLP
	return min(placementCap(season), max(0, seed))
}

func rankBaseTier(points int) int { return min(7, points/tierLP) }

func changeLadder(entry ladderEntry, r Rating, won bool) ladderEntry {
	trust := max(0, min(1, (InitialRD-r.BeforeRD)/270))
	gap := (glickoRankTarget(r.Before) - float64(entry.Points)) / divisionLP
	alignment := math.Round(max(-8, min(8, gap*trust)))
	result := 0.0
	if won {
		result = 1
	}
	delta := int(math.Round(50*(result-r.Expected) + alignment))
	if won {
		delta = max(1, min(40, delta))
	} else {
		delta = min(-1, max(-40, delta))
	}
	next := max(0, entry.Points+delta)
	if entry.Games < placementGames {
		next = min(placementCap(entry.Season), entry.Points+max(0, delta))
		if entry.Games == placementGames-1 {
			entry.Shield = rankBaseTier(next) > 0
		}
	} else {
		oldTier, newTier := rankBaseTier(entry.Points), rankBaseTier(next)
		if newTier > oldTier {
			entry.Shield = true
		} else if newTier < oldTier && entry.Shield {
			next = oldTier * tierLP
			entry.Shield = false
		}
	}
	entry.Points = next
	entry.Games++
	entry.LastRating = r.After
	if entry.Games >= placementGames {
		entry.Peak = max(entry.Peak, entry.Points)
	}
	return entry
}

func settleApex(entries map[string]ladderEntry, active map[string]bool, season int, date string) rankedDay {
	day := rankedDay{Season: season, Date: date}
	var candidates []ladderEntry
	for _, entry := range entries {
		if active[entry.PlayerID] && entry.Games >= placementGames && entry.Points >= grandmasterLP {
			candidates = append(candidates, entry)
		}
	}
	slices.SortFunc(candidates, func(a, b ladderEntry) int {
		if a.Points != b.Points {
			return b.Points - a.Points
		}
		if a.LastRating > b.LastRating {
			return -1
		}
		if a.LastRating < b.LastRating {
			return 1
		}
		return strings.Compare(a.PlayerID, b.PlayerID)
	})
	if len(candidates) > 0 && candidates[0].Points >= challengerLP {
		day.Challenger = candidates[0].PlayerID
		candidates = candidates[1:]
	}
	for i, entry := range candidates[:min(len(candidates), len(day.Grandmaster))] {
		day.Grandmaster[i] = entry.PlayerID
	}
	return day
}

// History is in the same canonical order as the Glicko replay. It already
// contains the pre-match confidence and both teams' expected outcomes.
func replayRanked(rules rankRules, matches []Match, history []Rating, active map[string]bool) rankedProjection {
	byID := make(map[string]Match, len(matches))
	for _, m := range matches {
		byID[m.ID] = m
	}

	var projection rankedProjection
	current := map[string]ladderEntry{}
	previous := map[string]ladderEntry{}
	season, day := 0, ""
	for _, r := range history {
		m := byID[r.MatchID]
		if m.Date < rules.StartOn {
			continue
		}
		if m.Date != day {
			if day != "" {
				projection.Days = append(projection.Days, settleApex(current, active, season, day))
			}
			year := rules.year(m.Date)
			if year.Number != season {
				for _, row := range current {
					projection.Entries = append(projection.Entries, row)
				}
				previous, current = current, map[string]ladderEntry{}
				season = year.Number
			}
			day = m.Date
		}
		entry, ok := current[r.PlayerID]
		if !ok {
			entry = ladderEntry{PlayerID: r.PlayerID, Season: season, Points: placementSeed(r, season, previous[r.PlayerID])}
		}
		won := slices.Contains(m.A, r.PlayerID) == (m.ScoreA > m.ScoreB)
		next := changeLadder(entry, r, won)
		projection.Games = append(projection.Games, RankedGame{
			MatchID: r.MatchID, PlayerID: r.PlayerID, Season: season,
			Games: next.Games, Before: entry.Points, After: next.Points,
		})
		current[r.PlayerID] = next
	}
	if day != "" {
		projection.Days = append(projection.Days, settleApex(current, active, season, day))
	}
	for _, row := range current {
		projection.Entries = append(projection.Entries, row)
	}
	slices.SortFunc(projection.Entries, func(a, b ladderEntry) int {
		if a.Season != b.Season {
			return a.Season - b.Season
		}
		return strings.Compare(a.PlayerID, b.PlayerID)
	})
	return projection
}
