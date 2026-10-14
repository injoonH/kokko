package kokko

import (
	"encoding/json"
	"errors"
	"math"
	"slices"
	"time"
	_ "time/tzdata"
)

var Seoul, _ = time.LoadLocation("Asia/Seoul")

const Initial = 1000.0
const K = 32.0

type Problem struct {
	Status  int
	Message string
}

func (p *Problem) Error() string        { return p.Message }
func fail(status int, msg string) error { return &Problem{status, msg} }
func Today(t time.Time) string          { return t.In(Seoul).Format("2006-01-02") }

type Match struct {
	ID      string   `json:"id"`
	Kind    string   `json:"kind"`
	Date    string   `json:"date"`
	Order   int      `json:"order"`
	A       []string `json:"a"`
	B       []string `json:"b"`
	ScoreA  int      `json:"scoreA"`
	ScoreB  int      `json:"scoreB"`
	Author  string   `json:"author"`
	Version int      `json:"version"`
	Deleted bool     `json:"deleted"`
	Created string   `json:"created"`
	Updated string   `json:"updated"`
}
type Mutation struct {
	RequestID string   `json:"requestId"`
	Action    string   `json:"action"`
	ID        string   `json:"id"`
	Version   int      `json:"version"`
	Kind      string   `json:"kind"`
	Date      string   `json:"date"`
	A         []string `json:"a"`
	B         []string `json:"b"`
	ScoreA    int      `json:"scoreA"`
	ScoreB    int      `json:"scoreB"`
	// Position is one-based. Zero means append (or preserve position on same-day edit).
	Position    int            `json:"position"`
	DayVersions map[string]int `json:"dayVersions"`
}
type Profile struct {
	ID       string `json:"id" db:"id"`
	Nickname string `json:"nickname" db:"nickname"`
	Avatar   string `json:"avatar" db:"avatar"`
	Status   string `json:"status" db:"status"`
}
type Rating struct {
	MatchID  string  `json:"matchId" db:"match_id"`
	PlayerID string  `json:"playerId" db:"player_id"`
	Kind     string  `json:"kind" db:"kind"`
	Before   float64 `json:"before" db:"before"`
	After    float64 `json:"after" db:"after"`
	Delta    float64 `json:"delta" db:"delta"`
	Expected float64 `json:"expected" db:"expected"`
}
type Ranking struct {
	PlayerID string  `json:"playerId" db:"player_id"`
	Kind     string  `json:"kind" db:"kind"`
	Rating   float64 `json:"rating" db:"rating"`
	Games    int     `json:"games" db:"games"`
	Rank     int     `json:"rank"`
}
type Pair struct {
	PlayerID string   `json:"playerId"`
	Games    int      `json:"games"`
	Wins     int      `json:"wins"`
	Losses   int      `json:"losses"`
	WinRate  float64  `json:"winRate"`
	Synergy  *float64 `json:"synergy"`
	Sum      float64  `json:"-"`
}
type Point struct {
	ID     string  `json:"id"`
	Date   string  `json:"date"`
	Order  int     `json:"order"`
	Rating float64 `json:"rating"`
	Delta  float64 `json:"delta"`
	Label  string  `json:"label"`
	Score  string  `json:"score"`
}
type Stats struct {
	Games     int     `json:"games"`
	Wins      int     `json:"wins"`
	Losses    int     `json:"losses"`
	WinRate   float64 `json:"winRate"`
	Change    float64 `json:"change"`
	Current   float64 `json:"current"`
	Rank      int     `json:"rank"`
	Points    []Point `json:"points"`
	Partners  []Pair  `json:"partners"`
	Opponents []Pair  `json:"opponents"`
}

func ValidScore(a, b int) bool {
	if a < b {
		a, b = b, a
	}
	return b >= 0 && ((a == 21 && b <= 19) || (a >= 22 && a <= 29 && b == a-2) || (a == 30 && (b == 28 || b == 29)))
}
func Validate(m Match, now time.Time) error {
	n := 2
	if m.Kind == "singles" {
		n = 1
	} else if m.Kind != "doubles" {
		return fail(400, "경기 종류를 확인해 주세요.")
	}
	if len(m.A) != n || len(m.B) != n {
		return fail(400, "단식은 팀당 1명, 복식은 팀당 2명이어야 합니다.")
	}
	seen := map[string]bool{}
	for _, p := range append(slices.Clone(m.A), m.B...) {
		if p == "" || seen[p] {
			return fail(400, "선수를 중복 없이 선택해 주세요.")
		}
		seen[p] = true
	}
	if !ValidScore(m.ScoreA, m.ScoreB) {
		return fail(400, "완료된 경기 점수를 입력해 주세요. 듀스와 30점 상한을 확인해 주세요.")
	}
	d, err := time.ParseInLocation("2006-01-02", m.Date, Seoul)
	if err != nil || d.Format("2006-01-02") != m.Date || m.Date > Today(now) {
		return fail(400, "오늘 또는 과거의 경기 날짜를 입력해 주세요.")
	}
	return nil
}
func participant(m Match, p string) bool { return slices.Contains(m.A, p) || slices.Contains(m.B, p) }
func ordered(ms []Match) {
	slices.SortFunc(ms, func(a, b Match) int {
		if a.Date < b.Date {
			return -1
		}
		if a.Date > b.Date {
			return 1
		}
		if a.Order != b.Order {
			return a.Order - b.Order
		}
		if a.ID < b.ID {
			return -1
		}
		if a.ID > b.ID {
			return 1
		}
		return 0
	})
}
func Replay(ms []Match, kind string) ([]Rating, []Ranking) {
	ordered(ms)
	current := map[string]float64{}
	games := map[string]int{}
	out := []Rating{}
	get := func(p string) float64 {
		v, ok := current[p]
		if !ok {
			return Initial
		}
		return v
	}
	for _, m := range ms {
		if m.Deleted || m.Kind != kind {
			continue
		}
		var ra, rb float64
		for _, p := range m.A {
			ra += get(p)
		}
		for _, p := range m.B {
			rb += get(p)
		}
		ra /= float64(len(m.A))
		rb /= float64(len(m.B))
		expected := 1 / (1 + math.Pow(10, (rb-ra)/400))
		actual := 0.0
		if m.ScoreA > m.ScoreB {
			actual = 1
		}
		delta := K * (actual - expected)
		for side, ps := range [][]string{m.A, m.B} {
			d, e := delta, expected
			if side == 1 {
				d, e = -delta, 1-expected
			}
			for _, p := range ps {
				before := get(p)
				current[p] = before + d
				games[p]++
				out = append(out, Rating{m.ID, p, kind, before, before + d, d, e})
			}
		}
	}
	ranks := []Ranking{}
	for p, v := range current {
		ranks = append(ranks, Ranking{PlayerID: p, Kind: kind, Rating: v, Games: games[p]})
	}
	slices.SortFunc(ranks, func(a, b Ranking) int {
		if math.Round(a.Rating) != math.Round(b.Rating) {
			if a.Rating > b.Rating {
				return -1
			}
			return 1
		}
		if a.PlayerID < b.PlayerID {
			return -1
		}
		return 1
	})
	rank := 0
	for i := range ranks {
		if i == 0 || math.Round(ranks[i].Rating) != math.Round(ranks[i-1].Rating) {
			rank = i + 1
		}
		ranks[i].Rank = rank
	}
	return out, ranks
}
func encode(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}
func problem(err error) (int, string) {
	var p *Problem
	if errors.As(err, &p) {
		return p.Status, p.Message
	}
	return 500, "요청을 처리하지 못했습니다."
}
