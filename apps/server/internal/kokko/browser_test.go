package kokko

// This harness exists only in the Go test binary. Production has no seed or
// session-creation endpoint. It uses a temporary database and actual app APIs.
import (
	"net"
	"net/http"
	"os"
	"os/signal"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func TestBrowserHarness(t *testing.T) {
	if os.Getenv("KOKKO_BROWSER_TEST") != "1" {
		t.Skip("browser harness is opt-in")
	}
	s, ids := setup(t)
	s.Now = time.Now
	names := []string{"유월", "서연", "지훈", "민서", "도윤", "하린"}
	for i, id := range ids {
		if err := exec(s.App, "UPDATE kokko_profiles SET nickname={:n} WHERE id={:id}", dbx.Params{"n": names[i], "id": id}); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.SetRole(ids[0], "admin"); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 12; i++ {
		q := create(ids)
		q.Date = Today(time.Now().AddDate(0, 0, -(12-i)/2))
		if i%3 == 0 {
			q.ScoreA, q.ScoreB = 18, 21
		}
		if i%4 == 0 {
			q.A = []string{ids[0], ids[2]}
			q.B = []string{ids[1], ids[3]}
		}
		mustMatch(t, s, ids[0], q)
	}
	pending := newUser(t, s, "신규 회원", "pending")
	invite, err := s.CreateInvitation("operator", true)
	if err != nil {
		t.Fatal(err)
	}
	Register(s.App, "../../../web/dist")
	s.App.OnServe().BindFunc(func(e *core.ServeEvent) error {
		e.Router.GET("/api/kokko/__test/session", func(e *core.RequestEvent) error {
			id := ids[0]
			if e.Request.URL.Query().Get("role") == "pending" {
				id = pending
			}
			if e.Request.URL.Query().Get("role") == "member" {
				id = ids[5]
			}
			u, err := s.App.FindRecordById("users", id)
			if err != nil {
				return err
			}
			token, err := u.NewAuthToken()
			if err != nil {
				return err
			}
			return e.JSON(200, map[string]any{"token": token, "record": u, "invite": invite})
		})
		return e.Next()
	})
	router, err := apis.NewRouter(s.App)
	if err != nil {
		t.Fatal(err)
	}
	event := &core.ServeEvent{App: s.App, Router: router}
	if err = s.App.OnServe().Trigger(event); err != nil {
		t.Fatal(err)
	}
	mux, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	listener, err := net.Listen("tcp", "127.0.0.1:8097")
	if err != nil {
		t.Fatal(err)
	}
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	defer server.Close()
	go server.Serve(listener)
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	defer signal.Stop(stop)
	<-stop
}
