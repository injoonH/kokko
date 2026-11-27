package kokko

import (
	"slices"
	"testing"
	"time"
)

func TestRankedPlacementAndTierMovement(t *testing.T) {
	r := Rating{Before: 1000, BeforeRD: InitialRD, Expected: .5}
	seed := placementSeed(r, 1, ladderEntry{})
	if seed != 0 {
		t.Fatal("uncertain new player started with a high rank", seed)
	}
	r.Before, r.BeforeRD = 1550, 60
	seed = placementSeed(r, 1, ladderEntry{})
	if seed != 1600 {
		t.Fatal("first year placement cap", seed)
	}
	entry := ladderEntry{Season: 1, Points: seed}
	for i := 0; i < 4; i++ {
		entry = changeLadder(entry, r, i%2 == 0)
	}
	if entry.Points != 1600 || entry.Peak != 0 {
		t.Fatal("provisional losses or wins escaped the cap", entry)
	}
	entry = changeLadder(entry, r, true)
	if entry.Points != 1600 || entry.Peak != 1600 || entry.Games != 5 {
		t.Fatal("fifth confirmation failed to lock placement", entry)
	}

	r.BeforeRD = InitialRD // neutral LP alignment
	entry = changeLadder(ladderEntry{Season: 1, Points: 397, Games: 5}, r, true)
	if entry.Points != 422 || !entry.Shield || rankMark(entry.Points, 0).Division != 4 {
		t.Fatal("promotion did not keep overflow", entry)
	}
	entry = changeLadder(entry, r, false)
	if entry.Points != 400 || entry.Shield {
		t.Fatal("tier shield did not stop the first demotion", entry)
	}
	entry = changeLadder(entry, r, false)
	if entry.Points != 375 || rankMark(entry.Points, 0).Division != 1 {
		t.Fatal("second loss did not demote", entry)
	}
	entry = changeLadder(ladderEntry{Season: 1, Points: 2790, Games: 30}, r, true)
	if got := rankMark(entry.Points, 0); got.Tier != "master" || got.LP != 15 || got.Division != 0 {
		t.Fatal("Diamond I promotion did not enter Master", got)
	}
}

func TestRankedPace(t *testing.T) {
	for _, test := range []struct {
		elo, chance float64
		wins        int
		want        int
	}{
		{1450, .5, 7, 67},
		{1450, .5, 8, 55},
		{1325, .9, 9, 0},
	} {
		e := ladderEntry{Season: 1, Points: 1600, Peak: 1600, Games: 5, Shield: true}
		got := 0
		for i := 1; i <= 200; i++ {
			won := i%10 > 0 && i%10 <= test.wins
			e = changeLadder(e, Rating{Before: test.elo, BeforeRD: 60, Expected: test.chance}, won)
			if e.Points >= masterLP {
				got = i
				break
			}
		}
		if got != test.want {
			t.Fatal("unexpected path to Master", test, got)
		}
	}
}

func TestRankedApexSlotsAndKoreanRefresh(t *testing.T) {
	s, ids := setup(t)
	now := s.Now()
	s.RankedStart = "2026-10-01"
	if err := s.EnsureRanked(); err != nil {
		t.Fatal(err)
	}
	mustMatch(t, s, ids[0], create(ids))
	const season = 1
	total := []int{3600, 3600, 3300, 3200}
	entries := map[string]ladderEntry{}
	active := map[string]bool{}
	projection := rankedProjection{}
	for i, id := range ids[:4] {
		entry := ladderEntry{PlayerID: id, Season: season, Games: 60, Points: total[i], LastRating: float64(1500 - i), Peak: total[i]}
		entries[id] = entry
		active[id] = true
		projection.Entries = append(projection.Entries, entry)
	}
	day := settleApex(entries, active, season, Today(now))
	if day.Challenger != ids[0] || day.Grandmaster != [2]string{ids[1], ids[2]} {
		t.Fatal(day)
	}
	active[ids[0]] = false
	other := settleApex(entries, active, season, Today(now))
	if other.Challenger != ids[1] || other.Grandmaster != [2]string{ids[2], ids[3]} {
		t.Fatal("suspended players used a slot", other)
	}
	projection.Days = []rankedDay{day}
	if err := replaceRanked(s.App, "doubles", projection); err != nil {
		t.Fatal(err)
	}
	board := func() []Ranking {
		b, err := s.SeasonLeaderboard("", "doubles", false, 0)
		if err != nil {
			t.Fatal(err)
		}
		return b["rankings"].([]Ranking)
	}
	first := board()
	if first[0].SeasonRank.Current.Tier != "master" || first[0].SeasonRank.Rank != first[1].SeasonRank.Rank {
		t.Fatal("today's games took a nightly slot or broke LP ties", first)
	}
	s.Now = func() time.Time { return now.AddDate(0, 0, 1) }
	after := board()
	if after[0].PlayerID != ids[0] || after[0].SeasonRank.Current.Tier != "challenger" ||
		after[0].SeasonRank.Peak.Tier != "challenger" || after[2].SeasonRank.Current.Tier != "grandmaster" {
		t.Fatal("apex did not refresh on the Korean date", after)
	}
	if y := (rankRules{StartOn: "2026-10-01"}).year("2027-10-01"); y.Number != 2 || y.EndsBefore != "2028-10-01" {
		t.Fatal("ranked year did not reset on its anniversary", y)
	}
	s.Now = func() time.Time { return now.AddDate(1, 0, 0) }
	if len(board()) != 0 {
		t.Fatal("last year's placement leaked into the new ranked year")
	}
}

func TestRankedCutoverReplayAndRollback(t *testing.T) {
	s, ids := setup(t)
	eloBefore := ratingFingerprint(t, s.App)
	s.RankedStart = Today(s.Now())
	if err := s.EnsureRanked(); err != nil {
		t.Fatal(err)
	}
	if ratingFingerprint(t, s.App) != eloBefore {
		t.Fatal("opening the ladder recalculated lifetime Elo")
	}
	first := stagePending(t, s, ids[0], create(ids))
	second := mustRecord(t, s, ids[0], create(ids))
	third := stagePending(t, s, ids[0], create(ids))
	if err := exec(s.App, "CREATE TRIGGER fail_lp BEFORE INSERT ON kokko_rank_games BEGIN SELECT RAISE(ABORT,'LP failure'); END", nil); err != nil {
		t.Fatal(err)
	}
	before := ratingFingerprint(t, s.App)
	if n, err := s.applyPendingMatches(); err == nil || n != 0 {
		t.Fatal("queue applied with an LP write failure", n, err)
	}
	if _, err := s.RecordMatch(ids[0], create(ids)); err == nil {
		t.Fatal("direct save succeeded with an LP write failure")
	}
	if ratingFingerprint(t, s.App) != before {
		t.Fatal("failed LP write partially changed accepted results")
	}
	if err := exec(s.App, "DROP TRIGGER fail_lp", nil); err != nil {
		t.Fatal(err)
	}
	if n, err := s.applyPendingMatches(); err != nil || n != 2 {
		t.Fatal("queue did not retry atomically", n, err)
	}
	ms, err := loadMatches(s.App)
	if err != nil {
		t.Fatal(err)
	}
	matchIDs := []string{first.ID, second.ID, third.ID}
	games, err := rankedMatchGames(s.App, matchIDs)
	if err != nil || len(games) != 12 || len(ms) != 3 || ms[0].ID != first.ID || ms[1].ID != second.ID || ms[2].ID != third.ID {
		t.Fatal("cutover changed reserved playing order", ms, games, err)
	}
	for _, game := range games {
		if game.Games != slices.Index(matchIDs, game.MatchID)+1 {
			t.Fatal("LP placement count followed the rollout time", game)
		}
	}
	if n, err := s.applyPendingMatches(); err != nil || n != 0 {
		t.Fatal("repeat startup reapplied the queue", n, err)
	}
	if err := s.EnsureRanked(); err != nil {
		t.Fatal(err)
	}
	after, err := rankedMatchGames(s.App, matchIDs)
	if err != nil || !slices.Equal(games, after) {
		t.Fatal("restart or retry changed the LP replay", games, after, err)
	}
}
