package kokko

import (
	"encoding/json"
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

type ActivityDay struct {
	Date  string `json:"date" db:"date"`
	Count int    `json:"count" db:"count"`
}
type ActivitySummary struct {
	Current    int           `json:"current"`
	Longest    int           `json:"longest"`
	ActiveDays int           `json:"activeDays"`
	Games      int           `json:"games"`
	Days       []ActivityDay `json:"days"`
}

func activitySummary(app core.App, id, today string) (*ActivitySummary, error) {
	out := &ActivitySummary{Days: []ActivityDay{}}
	base, err := time.Parse("2006-01-02", today)
	if err != nil {
		return nil, err
	}
	rows := []ActivityDay{}
	params := dbx.Params{"id": id, "today": today, "start": base.AddDate(0, 0, -364).Format("2006-01-02")}
	const source = ` FROM kokko_matches m JOIN kokko_participants p ON p.match_id=m.id WHERE p.player_id={:id} AND NOT json_extract(m.data,'$.deleted') AND m.played_on<={:today}`
	if err := app.DB().NewQuery("SELECT m.played_on AS date,COUNT(*) AS count" + source + " AND m.played_on>={:start} GROUP BY m.played_on").Bind(params).All(&rows); err != nil {
		return nil, err
	}
	counts := map[string]int{}
	for _, r := range rows {
		counts[r.Date] = r.Count
	}
	for i := -364; i <= 0; i++ {
		date := base.AddDate(0, 0, i).Format("2006-01-02")
		n := counts[date]
		out.Days = append(out.Days, ActivityDay{date, n})
		out.Games += n
		if n > 0 {
			out.ActiveDays++
		}
	}
	var longest struct {
		N int `db:"n"`
	}
	cte := `WITH days AS (SELECT DISTINCT m.played_on AS d` + source + `), islands AS (SELECT d,julianday(d)-ROW_NUMBER() OVER(ORDER BY d) AS island FROM days), runs AS (SELECT COUNT(*) AS n,MAX(d) AS last FROM islands GROUP BY island) `
	if err := app.DB().NewQuery(cte + "SELECT COALESCE(MAX(n),0) AS n FROM runs").Bind(params).One(&longest); err != nil {
		return nil, err
	}
	out.Longest = longest.N
	last := []struct {
		N    int    `db:"n"`
		Date string `db:"last"`
	}{}
	if err := app.DB().NewQuery(cte + "SELECT n,last FROM runs ORDER BY last DESC LIMIT 1").Bind(params).All(&last); err != nil {
		return nil, err
	}
	if len(last) > 0 && (last[0].Date == today || last[0].Date == base.AddDate(0, 0, -1).Format("2006-01-02")) {
		out.Current = last[0].N
	}
	return out, nil
}

func allRankings(app core.App, ids []string, today string) ([]Ranking, error) {
	out := []Ranking{}
	if len(ids) == 0 {
		return out, nil
	}
	query := app.DB().Select("r.*", `CASE WHEN u.status='active' AND r.games>0 THEN 1+(SELECT COUNT(*) FROM kokko_ratings other JOIN users ou ON ou.id=other.player_id WHERE ou.status='active' AND other.kind=r.kind AND other.games>0 AND ROUND(other.rating)>ROUND(r.rating)) ELSE 0 END AS rank`).From("kokko_ratings r").InnerJoin("users u", dbx.NewExp("u.id=r.player_id")).Where(dbx.In("r.player_id", stringsToAny(ids)...))
	if err := query.All(&out); err != nil {
		return nil, err
	}
	for i := range out {
		r := &out[i]
		r.RD = AgedRD(r.RD, r.LastPlayed, today)
	}
	return out, nil
}
func stringsToAny(ids []string) []any {
	out := make([]any, len(ids))
	for i, v := range ids {
		out[i] = v
	}
	return out
}
func profilesByID(app core.App, ids []string, actor ...string) ([]Profile, error) {
	out := []Profile{}
	if len(ids) == 0 {
		return out, nil
	}
	params := dbx.Params{}
	keys := []string{}
	for i, id := range ids {
		key := fmt.Sprintf("p%d", i)
		keys = append(keys, "{:"+key+"}")
		params[key] = id
	}
	columns := playerColumns
	if len(actor) > 0 {
		params["actor"] = actor[0]
		columns += ",CASE WHEN u.status='active' AND NOT EXISTS(SELECT 1 FROM kokko_blocks b WHERE (b.actor={:actor} AND b.target=p.id) OR (b.target={:actor} AND b.actor=p.id)) THEN 1 ELSE 0 END AS selectable"
	}
	err := app.DB().NewQuery("SELECT " + columns + playerJoins + " WHERE p.id IN (" + strings.Join(keys, ",") + ") ORDER BY p.nickname,p.id").Bind(params).All(&out)
	return out, err
}

func publicOrders(app core.App, ids []string) (map[string]int, error) {
	out := map[string]int{}
	if len(ids) == 0 {
		return out, nil
	}
	params := dbx.Params{}
	keys := []string{}
	for i, id := range ids {
		key := fmt.Sprintf("id%d", i)
		keys = append(keys, "{:"+key+"}")
		params[key] = id
	}
	in := strings.Join(keys, ",")
	rows := []struct {
		ID string `db:"id"`
		N  int    `db:"n"`
	}{}
	err := app.DB().NewQuery(`SELECT id,n FROM (SELECT m.id,ROW_NUMBER() OVER(PARTITION BY m.played_on ORDER BY s.position,m.id) AS n FROM kokko_matches m JOIN kokko_arena_slots s ON s.id=m.id WHERE NOT json_extract(m.data,'$.deleted') AND m.played_on IN (SELECT played_on FROM kokko_matches WHERE id IN (` + in + `))) WHERE id IN (` + in + `)`).Bind(params).All(&rows)
	for _, r := range rows {
		out[r.ID] = r.N
	}
	return out, err
}

func (s *Service) Leaderboard(actor, kind string, friends bool, page int) (map[string]any, error) {
	if kind != "singles" && kind != "doubles" {
		return nil, fail(400, "종목을 선택해 주세요.")
	}
	if page < 0 || page > 1000 {
		return nil, fail(400, "조회 범위를 확인해 주세요.")
	}
	rows := []struct {
		ID string `db:"player_id"`
	}{}
	params := dbx.Params{"k": kind, "actor": actor, "offset": page * 25}
	filter := ""
	if friends {
		if _, err := member(s.App, actor, false); err != nil {
			return nil, err
		}
		filter = ` AND (r.player_id={:actor} OR EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='friends' AND ((f.a={:actor} AND f.b=r.player_id) OR (f.b={:actor} AND f.a=r.player_id))))`
	}
	err := s.App.DB().NewQuery(`SELECT r.player_id FROM kokko_ratings r JOIN users u ON u.id=r.player_id WHERE r.kind={:k} AND r.games>0 AND u.status='active'` + filter + ` ORDER BY ROUND(r.rating) DESC,r.player_id LIMIT 26 OFFSET {:offset}`).Bind(params).All(&rows)
	if err != nil {
		return nil, err
	}
	more := len(rows) > 25
	if more {
		rows = rows[:25]
	}
	ids := []string{}
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	players, err := profilesByID(s.App, ids)
	if err != nil {
		return nil, err
	}
	ranks, err := allRankings(s.App, ids, Today(s.Now()))
	if err != nil {
		return nil, err
	}
	ranks = slices.DeleteFunc(ranks, func(r Ranking) bool { return r.Kind != kind })
	slices.SortFunc(ranks, func(a, b Ranking) int {
		if math.Round(a.Rating) != math.Round(b.Rating) {
			if a.Rating > b.Rating {
				return -1
			}
			return 1
		}
		return strings.Compare(a.PlayerID, b.PlayerID)
	})
	return map[string]any{"profiles": players, "rankings": ranks, "hasMore": more, "page": page}, nil
}

// ArenaState is a bounded public snapshot. History is paginated; aggregates,
// activity and partner/opponent totals use SQL over all accepted matches.
func (s *Service) ArenaState(actor string, f Filters, page int, at string, selectedIDs []string) (State, error) {
	out := State{Profiles: []Profile{}, Matches: []Match{}, AllMatches: []Match{}, Deleted: []Match{}, Ratings: []Rating{}, Rankings: []Ranking{}, Today: Today(s.Now()), Days: map[string]int{}}
	if f.Kind == "" {
		f.Kind = "doubles"
	}
	if f.Period == "" {
		f.Period = "30"
	}
	if f.Player == "" {
		f.Player = actor
	}
	if f.Kind != "singles" && f.Kind != "doubles" {
		return out, fail(400, "종목을 확인해 주세요.")
	}
	if f.Result != "" && f.Result != "win" && f.Result != "loss" {
		return out, fail(400, "승패 조건을 확인해 주세요.")
	}
	if page < 0 || page > 1000 || len(selectedIDs) > 100 {
		return out, fail(400, "조회 범위를 확인해 주세요.")
	}
	start, err := startDate(f.Period, s.Now())
	if err != nil {
		return out, err
	}
	out.Filters = f
	if at == "" {
		at = out.Today
	}
	if d, err := time.Parse("2006-01-02", at); err != nil || d.Format("2006-01-02") != at {
		return out, fail(400, "날짜를 확인해 주세요.")
	}
	pointLineups := map[string]Match{}
	err = s.App.RunInTransaction(func(app core.App) error {
		out.Me.ID = actor
		out.Me.Role = "member"
		out.Group = Group{ID: LegacyGroup, Name: "전체 코트", Visibility: "open", Role: "member"}
		if actor != "" {
			u, err := member(app, actor, false)
			if err != nil {
				return err
			}
			out.Me.Role = u.GetString("role")
			out.Me.ServiceRole = u.GetString("role")
		}
		var revision struct {
			N int `db:"revision"`
		}
		if err := app.DB().NewQuery("SELECT revision FROM kokko_meta WHERE id=1").One(&revision); err != nil {
			return err
		}
		out.Revision = revision.N
		ids := map[string]bool{}
		if actor != "" {
			ids[actor] = true
		}
		for _, id := range selectedIDs {
			ids[id] = true
		}
		selected := f.Player
		if selected == "all" {
			selected = actor
		}
		if selected != "" {
			ids[selected] = true
		}
		// Friends and recent opponents/partners appear before directory search.
		quick := []struct {
			ID     string `db:"id"`
			Friend bool   `db:"friend"`
		}{}
		if err := app.DB().NewQuery(`SELECT p.id,EXISTS(SELECT 1 FROM kokko_friendships f WHERE f.status='friends' AND ((f.a={:a} AND f.b=p.id) OR (f.b={:a} AND f.a=p.id))) AS friend FROM kokko_profiles p JOIN users u ON u.id=p.id WHERE u.status='active' AND NOT EXISTS(SELECT 1 FROM kokko_blocks b WHERE (b.actor={:a} AND b.target=p.id) OR (b.target={:a} AND b.actor=p.id)) ORDER BY friend DESC, (SELECT MAX(m.played_on) FROM kokko_matches m JOIN kokko_participants x ON x.match_id=m.id JOIN kokko_participants me ON me.match_id=m.id AND me.player_id={:a} WHERE x.player_id=p.id AND NOT json_extract(m.data,'$.deleted')) DESC,p.nickname,p.id LIMIT 100`).Bind(dbx.Params{"a": actor}).All(&quick); err != nil {
			return err
		}
		out.Friends = []string{}
		for _, p := range quick {
			ids[p.ID] = true
			if p.Friend {
				out.Friends = append(out.Friends, p.ID)
			}
		}
		params := dbx.Params{"kind": f.Kind, "start": start, "player": f.Player, "offset": page * 25, "at": at}
		where := `NOT json_extract(m.data,'$.deleted') AND m.kind={:kind} AND m.played_on>={:start}`
		if f.Player != "" && f.Player != "all" {
			where += ` AND EXISTS(SELECT 1 FROM kokko_participants p WHERE p.match_id=m.id AND p.player_id={:player})`
		}
		if f.Result != "" {
			params["player"] = selected
			params["win"] = f.Result == "win"
			where += ` AND EXISTS(SELECT 1 FROM kokko_participants p WHERE p.match_id=m.id AND p.player_id={:player} AND ((p.team='A')=(json_extract(m.data,'$.scoreA')>json_extract(m.data,'$.scoreB')))={:win})`
		}
		rows := []struct {
			Data string `db:"data"`
		}{}
		if err := app.DB().NewQuery("SELECT m.data FROM kokko_matches m WHERE " + where + " ORDER BY m.played_on DESC,m.day_order DESC,m.id DESC LIMIT 26 OFFSET {:offset}").Bind(params).All(&rows); err != nil {
			return err
		}
		out.HasMore = len(rows) > 25
		if out.HasMore {
			rows = rows[:25]
		}
		collect := func(m Match) {
			for _, id := range append(slices.Clone(m.A), m.B...) {
				ids[id] = true
			}
			ids[m.Author] = true
		}
		for _, r := range rows {
			var m Match
			if err := jsonDecode(r.Data, &m); err != nil {
				return err
			}
			collect(m)
			m.GroupID = ""
			out.Matches = append(out.Matches, m)
		}
		// Day data is used by authenticated planners and the entry form.
		if actor != "" {
			day, err := publicDay(app, at, "", 1001)
			if err != nil {
				return err
			}
			out.DayTruncated = len(day) > 1000
			if out.DayTruncated {
				day = day[:1000]
			}
			for _, m := range day {
				collect(m)
				m.GroupID = ""
				out.AllMatches = append(out.AllMatches, m)
			}
			var v struct {
				N int `db:"version"`
			}
			vs := []struct {
				N int `db:"version"`
			}{}
			if err := app.DB().NewQuery("SELECT version FROM kokko_arena_days WHERE played_on={:d}").Bind(dbx.Params{"d": at}).All(&vs); err != nil {
				return err
			}
			if len(vs) > 0 {
				v.N = vs[0].N
			}
			out.Days[at] = v.N

		}
		out.Stats = Stats{Current: Initial, Points: []Point{}, Partners: []Pair{}, Opponents: []Pair{}}
		if selected != "" {
			var count struct {
				N int `db:"n"`
			}
			if err := app.DB().NewQuery("SELECT COUNT(*) AS n FROM kokko_profiles WHERE id={:id}").Bind(dbx.Params{"id": selected}).One(&count); err != nil {
				return err
			}
			if count.N == 0 {
				return fail(404, "선수를 찾을 수 없습니다.")
			}
			params["id"] = selected
			const from = ` FROM kokko_matches m JOIN kokko_participants me ON me.match_id=m.id AND me.player_id={:id} JOIN kokko_rating_history h ON h.match_id=m.id AND h.player_id=me.player_id WHERE NOT json_extract(m.data,'$.deleted') AND m.kind={:kind} AND m.played_on>={:start}`
			var totals struct {
				Games  int     `db:"games"`
				Wins   int     `db:"wins"`
				Change float64 `db:"change"`
			}
			if err := app.DB().NewQuery(`SELECT COUNT(*) AS games,COALESCE(SUM((me.team='A')=(json_extract(m.data,'$.scoreA')>json_extract(m.data,'$.scoreB'))),0) AS wins,COALESCE(SUM(h.delta),0) AS change` + from).Bind(params).One(&totals); err != nil {
				return err
			}
			out.Stats.Games = totals.Games
			out.Stats.Wins = totals.Wins
			out.Stats.Losses = totals.Games - totals.Wins
			out.Stats.Change = totals.Change
			if totals.Games > 0 {
				out.Stats.WinRate = 100 * float64(totals.Wins) / float64(totals.Games)
			}
			for _, team := range []bool{true, false} {
				cmp := "!="
				if team {
					cmp = "="
				}
				pairs := []Pair{}
				query := `SELECT other.player_id,COUNT(*) AS games,SUM((me.team='A')=(json_extract(m.data,'$.scoreA')>json_extract(m.data,'$.scoreB'))) AS wins,SUM(((me.team='A')=(json_extract(m.data,'$.scoreA')>json_extract(m.data,'$.scoreB')))-h.expected) AS sum FROM kokko_matches m JOIN kokko_participants me ON me.match_id=m.id AND me.player_id={:id} JOIN kokko_participants other ON other.match_id=m.id AND other.player_id!=me.player_id AND other.team` + cmp + `me.team JOIN kokko_rating_history h ON h.match_id=m.id AND h.player_id=me.player_id WHERE NOT json_extract(m.data,'$.deleted') AND m.kind={:kind} AND m.played_on>={:start} GROUP BY other.player_id ORDER BY games DESC,other.player_id LIMIT 50`
				if err := app.DB().NewQuery(query).Bind(params).All(&pairs); err != nil {
					return err
				}
				for i := range pairs {
					p := &pairs[i]
					p.Losses = p.Games - p.Wins
					p.WinRate = 100 * float64(p.Wins) / float64(p.Games)
					if team && p.Games >= 5 {
						v := 100 * p.Sum / float64(p.Games)
						p.Synergy = &v
					}
					ids[p.PlayerID] = true
				}
				if team {
					out.Stats.Partners = pairs
				} else {
					out.Stats.Opponents = pairs
				}
			}
			points := []struct {
				Data   string  `db:"data"`
				Before float64 `db:"before"`
				After  float64 `db:"after"`
				Delta  float64 `db:"delta"`
			}{}
			if err := app.DB().NewQuery("SELECT m.data,h.before,h.after,h.delta" + from + " ORDER BY m.played_on DESC,m.day_order DESC,m.id DESC LIMIT 200").Bind(params).All(&points); err != nil {
				return err
			}
			slices.Reverse(points)
			out.ChartTruncated = totals.Games > 200
			for _, r := range points {
				var m Match
				if err := jsonDecode(r.Data, &m); err != nil {
					return err
				}
				collect(m)
				pointLineups[m.ID] = m
				out.Stats.Points = append(out.Stats.Points, Point{ID: m.ID, Date: m.Date, Order: m.Order, Rating: r.After, Delta: r.Delta, Score: strings.TrimSpace(encode(m.ScoreA) + " : " + encode(m.ScoreB))})
			}
			if len(points) > 0 {
				var m Match
				json.Unmarshal([]byte(points[0].Data), &m)
				out.Stats.Points = append([]Point{{ID: "baseline", Date: m.Date, Rating: points[0].Before, Label: "표시 구간 시작"}}, out.Stats.Points...)
			}
			activity, err := activitySummary(app, selected, out.Today)
			if err != nil {
				return err
			}
			out.Activity = activity
		}
		idList := []string{}
		for id := range ids {
			if id != "" {
				idList = append(idList, id)
			}
		}
		players, err := profilesByID(app, idList, actor)
		if err != nil {
			return err
		}
		out.Profiles = players
		names := map[string]string{}
		for _, p := range players {
			names[p.ID] = p.Nickname
		}
		for i := range out.Stats.Points {
			point := &out.Stats.Points[i]
			if m, ok := pointLineups[point.ID]; ok {
				a, b := []string{}, []string{}
				for _, id := range m.A {
					a = append(a, names[id])
				}
				for _, id := range m.B {
					b = append(b, names[id])
				}
				point.Label = strings.Join(a, " · ") + " vs " + strings.Join(b, " · ")
			}
		}
		quickOrder := map[string]int{}
		for i, p := range quick {
			quickOrder[p.ID] = i
		}
		publicIDs := []string{}
		for _, m := range out.Matches {
			publicIDs = append(publicIDs, m.ID)
		}
		for _, point := range out.Stats.Points {
			if point.ID != "baseline" {
				publicIDs = append(publicIDs, point.ID)
			}
		}
		orders, err := publicOrders(app, publicIDs)
		if err != nil {
			return err
		}
		for i := range out.Matches {
			out.Matches[i].Order = orders[out.Matches[i].ID]
		}
		for i := range out.Stats.Points {
			if n, ok := orders[out.Stats.Points[i].ID]; ok {
				out.Stats.Points[i].Order = n
			}
		}
		// Prioritize friends in quick pickers while keeping chart/history names.
		slices.SortStableFunc(out.Profiles, func(a, b Profile) int {
			af, bf := slices.Contains(out.Friends, a.ID), slices.Contains(out.Friends, b.ID)
			if af != bf {
				if af {
					return -1
				}
				return 1
			}
			ai, aok := quickOrder[a.ID]
			bi, bok := quickOrder[b.ID]
			if aok != bok {
				if aok {
					return -1
				}
				return 1
			}
			if aok && ai != bi {
				return ai - bi
			}
			return strings.Compare(a.Nickname+a.ID, b.Nickname+b.ID)
		})
		out.Rankings, err = allRankings(app, idList, out.Today)
		if err != nil {
			return err
		}
		out.Season, err = rankedYear(app, out.Today)
		if err != nil {
			return err
		}
		if err := attachSeasonRanks(app, out.Season, out.Today, idList, out.Rankings); err != nil {
			return err
		}
		for _, r := range out.Rankings {
			if r.PlayerID == selected && r.Kind == f.Kind {
				out.Stats.Current = r.Rating
				out.Stats.Rank = r.Rank
			}
		}
		if len(out.Stats.Points) == 0 {
			out.Stats.Points = []Point{{ID: "baseline", Date: out.Today, Rating: out.Stats.Current, Label: "현재 Elo"}}
		}
		matches := []string{}
		for _, m := range out.Matches {
			matches = append(matches, m.ID)
		}
		if len(matches) > 0 {
			if err := app.DB().Select("*").From("kokko_rating_history").Where(dbx.In("match_id", stringsToAny(matches)...)).OrderBy("match_id", "player_id").All(&out.Ratings); err != nil {
				return err
			}
		}
		out.RankedGames, err = rankedMatchGames(app, matches)
		return err
	})
	return out, err
}
