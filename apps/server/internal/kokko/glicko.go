package kokko

import (
	"math"
	"time"
)

// Glicko-1, https://www.glicko.net/glicko/glicko.pdf. These are
// kokko settings, not undocumented Chess.com implementation constants.
const InitialRD = 350.0
const MinimumRD = 30.0
const DailyVariance = (InitialRD*InitialRD - 50*50) / 365.0
const RatingSystem = 1 // bump when replay semantics change

type Skill struct {
	Rating float64 `json:"rating"`
	RD     float64 `json:"rd"`
}

type Observation struct {
	Opponent Skill
	Score    float64
}

func g(rd float64) float64 {
	q := math.Log(10) / 400
	return 1 / math.Sqrt(1+3*q*q*rd*rd/(math.Pi*math.Pi))
}

func expectation(rating, opponent, rd float64) float64 {
	return 1 / (1 + math.Pow(10, -g(rd)*(rating-opponent)/400))
}

// GlickoUpdate applies the published rating-period equations without aging or
// the application RD floor, allowing verification against the author's example.
func GlickoUpdate(player Skill, results []Observation) Skill {
	q := math.Log(10) / 400
	precision, residual := 1/(player.RD*player.RD), 0.0
	for _, result := range results {
		weight := g(result.Opponent.RD)
		e := expectation(player.Rating, result.Opponent.Rating, result.Opponent.RD)
		precision += q * q * weight * weight * e * (1 - e)
		residual += weight * (result.Score - e)
	}
	return Skill{player.Rating + q/precision*residual, math.Sqrt(1 / precision)}
}

func AgedRD(rd float64, last, date string) float64 {
	previous, e1 := time.Parse("2006-01-02", last)
	current, e2 := time.Parse("2006-01-02", date)
	if e1 != nil || e2 != nil || !current.After(previous) {
		return rd
	}
	days := current.Sub(previous).Hours() / 24
	return math.Min(InitialRD, math.Sqrt(rd*rd+DailyVariance*days))
}

// A team's skill is its members' mean. Update one member's contribution r/n
// against (sum(opponents)-sum(other teammates))/n, with all other independent
// variances included. Rescale the posterior by n. This is a documented doubles
// approximation; with one player it is exactly Glicko-1. All players in a match
// must use the same pre-match snapshot (never sequentially updated teammates).
func UpdateTeamPlayer(own, opponents []Skill, index int, score float64) (Skill, float64) {
	n := float64(len(own))
	other := Skill{}
	for _, p := range opponents {
		other.Rating += p.Rating
		other.RD += p.RD * p.RD
	}
	for i, p := range own {
		if i != index {
			other.Rating -= p.Rating
			other.RD += p.RD * p.RD
		}
	}
	other.Rating /= n
	other.RD = math.Sqrt(other.RD) / n
	player := Skill{own[index].Rating / n, own[index].RD / n}
	after := GlickoUpdate(player, []Observation{{other, score}})
	return Skill{after.Rating * n, math.Max(MinimumRD, after.RD*n)}, expectation(player.Rating, other.Rating, other.RD)
}

// The author's pre-game prediction accounts for BOTH sides' uncertainty.
func TeamWinProbability(a, b []Skill) float64 {
	n := float64(len(a))
	ra, rb, variance := 0.0, 0.0, 0.0
	for _, p := range a {
		ra += p.Rating
		variance += p.RD * p.RD
	}
	for _, p := range b {
		rb += p.Rating
		variance += p.RD * p.RD
	}
	return expectation(ra/n, rb/n, math.Sqrt(variance)/n)
}
