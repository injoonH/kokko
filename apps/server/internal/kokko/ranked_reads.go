package kokko

import (
	"strconv"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type RankMark struct {
	Tier     string `json:"tier"`
	Division int    `json:"division,omitempty"`
	LP       int    `json:"lp"`
}

type SeasonRank struct {
	Games   int       `json:"games"`
	Rank    int       `json:"rank"`
	Current RankMark  `json:"current"`
	Peak    *RankMark `json:"peak,omitempty"`
	Next    *RankMark `json:"next,omitempty"`
}

type rankRow struct {
	PlayerID string `db:"player_id"`
	Points   int    `db:"points"`
	Games    int    `db:"games"`
	Peak     int    `db:"peak"`
	Season   int    `db:"season"`
	Kind     string `db:"kind"`
	Tier     int    `db:"tier"`
	PeakTier int    `db:"peak_tier"`
	Place    int    `db:"place"`
}

func rankMark(points, apex int) RankMark {
	tier := max(rankBaseTier(points), apex)
	if tier >= 7 {
		return RankMark{Tier: rankedTiers[tier], LP: max(0, points-masterLP)}
	}
	return RankMark{
		Tier: rankedTiers[tier], Division: 4 - (points%tierLP)/divisionLP, LP: points % divisionLP,
	}
}

func (row rankRow) rank() *SeasonRank {
	out := &SeasonRank{Games: row.Games, Rank: row.Place, Current: rankMark(row.Points, row.Tier)}
	if row.Games >= placementGames {
		peak := rankMark(row.Peak, row.PeakTier)
		out.Peak = &peak
	}
	if row.Tier < 7 {
		next := rankMark(row.Points+divisionLP-out.Current.LP, 0)
		out.Next = &next
	}
	return out
}

func rankedYear(app core.App, today string) (*RankedYear, error) {
	rules, err := readRankRules(app)
	if err != nil || rules == nil {
		return nil, err
	}
	year := rules.year(today)
	return &year, nil
}

// Choose the last completed Korean playing date per discipline. A result
// played today changes LP immediately, with competitive seats re-evaluated
// when that date ends. Late edits rebuild the affected date snapshots.
const rankedRowsQuery = `
WITH daily AS (
 SELECT d.* FROM kokko_rank_days d
 WHERE d.season={:season} AND d.played_on=(
  SELECT MAX(history.played_on) FROM kokko_rank_days history
  WHERE history.season=d.season AND history.kind=d.kind AND history.played_on<{:today}
 )
), badges AS (
 SELECT r.*, u.status='active' AS active,
  CASE WHEN a.challenger=r.player_id THEN 9
       WHEN r.player_id IN (a.grandmaster_a,a.grandmaster_b) THEN 8
       ELSE MIN(7,r.points/{:tier_lp}) END AS tier,
  u.status='active' AND r.games>={:placements} AS placed
 FROM kokko_rank_entries r JOIN users u ON u.id=r.player_id
 LEFT JOIN daily a ON a.season=r.season AND a.kind=r.kind
 WHERE r.season={:season}
), positions AS (
 SELECT badges.*, CASE WHEN placed THEN RANK() OVER (
  PARTITION BY kind ORDER BY placed DESC,tier DESC,points DESC
 ) ELSE 0 END AS place
 FROM badges
)
SELECT p.player_id,p.kind,p.season,p.points,p.games,p.peak,p.tier,p.place,
 CASE WHEN EXISTS (SELECT 1 FROM kokko_rank_days d WHERE d.season=p.season AND d.kind=p.kind
      AND d.played_on<{:today} AND d.challenger=p.player_id) THEN 9
      WHEN EXISTS (SELECT 1 FROM kokko_rank_days d WHERE d.season=p.season AND d.kind=p.kind
      AND d.played_on<{:today} AND p.player_id IN (d.grandmaster_a,d.grandmaster_b)) THEN 8
      ELSE MIN(7,p.peak/{:tier_lp}) END AS peak_tier
FROM positions p
`

// Scope is applied after the window function, so friends and pages keep the
// same public positions they had on the complete ladder.
func rankedRows(app core.App, year *RankedYear, today, scope string, params dbx.Params) ([]rankRow, error) {
	if year == nil || !year.Active {
		return nil, nil
	}
	params["season"], params["today"] = year.Number, today
	params["tier_lp"], params["placements"] = tierLP, placementGames
	var rows []rankRow
	err := app.DB().NewQuery(rankedRowsQuery + scope).Bind(params).All(&rows)
	return rows, err
}

func attachSeasonRanks(app core.App, year *RankedYear, today string, ids []string, rankings []Ranking) error {
	if len(ids) == 0 || len(rankings) == 0 {
		return nil
	}
	params := dbx.Params{}
	keys := make([]string, len(ids))
	for i, id := range ids {
		name := "p" + strconv.Itoa(i)
		keys[i], params[name] = "{:"+name+"}", id
	}
	rows, err := rankedRows(app, year, today, "WHERE p.player_id IN ("+strings.Join(keys, ",")+")", params)
	if err != nil {
		return err
	}
	byPool := make(map[[2]string]*SeasonRank, len(rows))
	for _, row := range rows {
		byPool[[2]string{row.PlayerID, row.Kind}] = row.rank()
	}
	for i := range rankings {
		v := &rankings[i]
		v.SeasonRank = byPool[[2]string{v.PlayerID, v.Kind}]
	}
	return nil
}

func (s *Service) SeasonLeaderboard(actor, kind string, friends bool, page int) (map[string]any, error) {
	if kind != "singles" && kind != "doubles" {
		return nil, fail(400, "종목을 선택해 주세요.")
	}
	if page < 0 || page > 1000 {
		return nil, fail(400, "조회 범위를 확인해 주세요.")
	}
	result := map[string]any{"profiles": []Profile{}, "rankings": []Ranking{}, "hasMore": false, "page": page}
	today := Today(s.Now())
	err := s.App.RunInTransaction(func(app core.App) error {
		year, err := rankedYear(app, today)
		if err != nil {
			return err
		}
		result["season"] = year
		params := dbx.Params{"kind": kind, "offset": page * 25}
		scope := "WHERE p.active AND p.kind={:kind}"
		if friends {
			if _, err := member(app, actor, false); err != nil {
				return err
			}
			params["actor"] = actor
			scope += ` AND (p.player_id={:actor} OR EXISTS (
   SELECT 1 FROM kokko_friendships f WHERE f.status='friends' AND
   ((f.a={:actor} AND f.b=p.player_id) OR (f.b={:actor} AND f.a=p.player_id))))`
		}
		rows, err := rankedRows(app, year, today, scope+" ORDER BY p.placed DESC,p.tier DESC,p.points DESC,p.player_id LIMIT 26 OFFSET {:offset}", params)
		if err != nil {
			return err
		}
		more := len(rows) > 25
		if more {
			rows = rows[:25]
		}
		ids := make([]string, 0, len(rows))
		for _, row := range rows {
			ids = append(ids, row.PlayerID)
		}
		profiles, err := profilesByID(app, ids)
		if err != nil {
			return err
		}
		elo, err := allRankings(app, ids, today)
		if err != nil {
			return err
		}
		byPlayer := make(map[string]Ranking, len(rows))
		for _, entry := range elo {
			if entry.Kind == kind {
				byPlayer[entry.PlayerID] = entry
			}
		}
		rankings := make([]Ranking, 0, len(rows))
		for _, row := range rows {
			entry := byPlayer[row.PlayerID]
			entry.SeasonRank = row.rank()
			rankings = append(rankings, entry)
		}
		result["profiles"], result["rankings"], result["hasMore"] = profiles, rankings, more
		return nil
	})
	return result, err
}
