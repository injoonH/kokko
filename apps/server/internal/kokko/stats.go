package kokko

import (
	"fmt"
	"math"
	"slices"
	"strings"
	"time"

	"github.com/pocketbase/pocketbase/core"
)

type Filters struct {
	Kind   string `json:"kind"`
	Period string `json:"period"`
	Player string `json:"player"`
	Result string `json:"result"`
}
type State struct {
	Me struct {
		ID   string `json:"id"`
		Role string `json:"role"`
	} `json:"me"`
	Today      string         `json:"today"`
	Revision   int            `json:"revision"`
	Profiles   []Profile      `json:"profiles"`
	Matches    []Match        `json:"matches"`
	AllMatches []Match        `json:"allMatches"`
	Deleted    []Match        `json:"deleted"`
	Ratings    []Rating       `json:"ratings"`
	Rankings   []Ranking      `json:"rankings"`
	Days       map[string]int `json:"days"`
	Stats      Stats          `json:"stats"`
	Filters    Filters        `json:"filters"`
}

func startDate(period string, now time.Time) (string, error) {
	days := 0
	switch period {
	case "7":
		days = 7
	case "30":
		days = 30
	case "90":
		days = 90
	case "all":
		return "", nil
	default:
		return "", fail(400, "조회 기간을 확인해 주세요.")
	}
	return now.In(Seoul).AddDate(0, 0, -days+1).Format("2006-01-02"), nil
}
func (s *Service) State(actor string, f Filters) (State, error) {
	out := State{Profiles: []Profile{}, Matches: []Match{}, AllMatches: []Match{}, Deleted: []Match{}, Ratings: []Rating{}, Rankings: []Ranking{}, Today: Today(s.Now())}
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
		return out, fail(400, "경기 종류를 확인해 주세요.")
	}
	if f.Result != "" && f.Result != "win" && f.Result != "loss" {
		return out, fail(400, "승패 필터를 확인해 주세요.")
	}
	start, err := startDate(f.Period, s.Now())
	if err != nil {
		return out, err
	}
	out.Filters = f
	s.mu.Lock()
	defer s.mu.Unlock()
	err = s.App.RunInTransaction(func(app core.App) error {
		u, err := member(app, actor, false)
		if err != nil {
			return err
		}
		out.Me.ID = actor
		out.Me.Role = u.GetString("role")
		if err = app.DB().NewQuery("SELECT p.id,p.nickname,p.avatar,u.status FROM kokko_profiles p JOIN users u ON u.id=p.id ORDER BY p.nickname,p.id").All(&out.Profiles); err != nil {
			return err
		}
		selected := f.Player
		if selected == "all" {
			selected = actor
		}
		exists := false
		for _, p := range out.Profiles {
			if p.ID == selected {
				exists = true
			}
		}
		if !exists {
			return fail(400, "선수를 찾을 수 없습니다.")
		}
		ms, err := loadMatches(app)
		if err != nil {
			return err
		}
		for _, m := range ms {
			if m.Deleted {
				if out.Me.Role == "admin" {
					out.Deleted = append(out.Deleted, m)
				}
				continue
			}
			out.AllMatches = append(out.AllMatches, m)
			if m.Kind != f.Kind || m.Date < start {
				continue
			}
			if f.Player != "all" && !participant(m, selected) {
				continue
			}
			if f.Result != "" {
				if !participant(m, selected) {
					continue
				}
				win := slices.Contains(m.A, selected) == (m.ScoreA > m.ScoreB)
				if (f.Result == "win") != win {
					continue
				}
			}
			out.Matches = append(out.Matches, m)
		}
		slices.Reverse(out.Matches)
		if err = app.DB().NewQuery("SELECT * FROM kokko_rating_history").All(&out.Ratings); err != nil {
			return err
		}
		if err = app.DB().NewQuery("SELECT * FROM kokko_ratings").All(&out.Rankings); err != nil {
			return err
		}
		slices.SortFunc(out.Rankings, func(a, b Ranking) int {
			if a.Kind != b.Kind {
				if a.Kind < b.Kind {
					return -1
				}
				return 1
			}
			if math.Round(a.Rating) != math.Round(b.Rating) {
				if a.Rating > b.Rating {
					return -1
				}
				return 1
			}
			return strings.Compare(a.PlayerID, b.PlayerID)
		})
		active := map[string]bool{}
		for _, p := range out.Profiles {
			active[p.ID] = p.Status == "active"
		}
		rank, pos := 0, 0
		var previous float64
		kind := ""
		for i := range out.Rankings {
			r := &out.Rankings[i]
			if r.Kind != kind {
				kind = r.Kind
				pos = 0
			}
			if !active[r.PlayerID] {
				continue
			}
			pos++
			if pos == 1 || math.Round(r.Rating) != previous {
				rank = pos
			}
			r.Rank = rank
			previous = math.Round(r.Rating)
		}
		if out.Days, err = dayVersions(app); err != nil {
			return err
		}
		var meta struct {
			Revision int `db:"revision"`
		}
		if err = app.DB().NewQuery("SELECT revision FROM kokko_meta WHERE id=1").One(&meta); err != nil {
			return err
		}
		out.Revision = meta.Revision
		out.Stats = ComputeStats(out.AllMatches, out.Ratings, out.Rankings, out.Profiles, selected, f.Kind, start, out.Today)
		return nil
	})
	return out, err
}
func ComputeStats(ms []Match, rs []Rating, ranks []Ranking, profiles []Profile, player, kind, start, today string) Stats {
	st := Stats{Current: Initial, Points: []Point{}, Partners: []Pair{}, Opponents: []Pair{}}
	baseline := Initial
	names := map[string]string{}
	for _, p := range profiles {
		names[p.ID] = p.Nickname
	}
	ratings := map[string]Rating{}
	for _, r := range rs {
		if r.PlayerID == player && r.Kind == kind {
			ratings[r.MatchID] = r
		}
	}
	for _, r := range ranks {
		if r.PlayerID == player && r.Kind == kind {
			st.Current = r.Rating
			st.Rank = r.Rank
		}
	}
	partners, opponents := map[string]*Pair{}, map[string]*Pair{}
	ordered(ms)
	baseDate := start
	if baseDate == "" {
		baseDate = today
		for _, m := range ms {
			if !m.Deleted && m.Kind == kind && participant(m, player) {
				baseDate = m.Date
				break
			}
		}
	}
	for _, m := range ms {
		if m.Deleted || m.Kind != kind || !participant(m, player) {
			continue
		}
		r, ok := ratings[m.ID]
		if !ok {
			continue
		}
		if m.Date < start {
			baseline = r.After
			continue
		}
		st.Games++
		win := slices.Contains(m.A, player) == (m.ScoreA > m.ScoreB)
		actual := 0.0
		if win {
			st.Wins++
			actual = 1
		} else {
			st.Losses++
		}
		label := func(ps []string) string {
			n := []string{}
			for _, p := range ps {
				n = append(n, names[p])
			}
			return strings.Join(n, " · ")
		}
		st.Points = append(st.Points, Point{ID: m.ID, Date: m.Date, Order: m.Order, Rating: r.After, Delta: r.Delta, Label: label(m.A) + " vs " + label(m.B), Score: fmt.Sprintf("%d : %d", m.ScoreA, m.ScoreB)})
		own, opp := m.A, m.B
		if slices.Contains(m.B, player) {
			own, opp = m.B, m.A
		}
		add := func(dest map[string]*Pair, p string) {
			if dest[p] == nil {
				dest[p] = &Pair{PlayerID: p}
			}
			v := dest[p]
			v.Games++
			if win {
				v.Wins++
			} else {
				v.Losses++
			}
			v.Sum += actual - r.Expected
		}
		if kind == "doubles" {
			for _, p := range own {
				if p != player {
					add(partners, p)
				}
			}
		}
		for _, p := range opp {
			add(opponents, p)
		}
	}
	if st.Games > 0 {
		st.WinRate = 100 * float64(st.Wins) / float64(st.Games)
		st.Change = st.Points[len(st.Points)-1].Rating - baseline
	}
	st.Points = append([]Point{{ID: "baseline", Date: baseDate, Rating: baseline, Label: "기간 시작 기준"}}, st.Points...)
	finish := func(src map[string]*Pair, synergy bool) []Pair {
		out := []Pair{}
		for _, p := range src {
			p.WinRate = 100 * float64(p.Wins) / float64(p.Games)
			if synergy && p.Games >= 5 {
				v := 100 * p.Sum / float64(p.Games)
				p.Synergy = &v
			}
			out = append(out, *p)
		}
		slices.SortFunc(out, func(a, b Pair) int {
			if a.Games != b.Games {
				return b.Games - a.Games
			}
			return strings.Compare(a.PlayerID, b.PlayerID)
		})
		return out
	}
	st.Partners = finish(partners, true)
	st.Opponents = finish(opponents, false)
	return st
}
