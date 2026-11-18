package kokko

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func respond(e *core.RequestEvent, v any, err error) error {
	if err != nil {
		status, _ := problem(err)
		if status == 500 {
			e.App.Logger().Error("kokko request failed", "error", err)
		}
		return e.JSON(status, map[string]string{"message": ErrorMessage(err)})
	}
	return e.JSON(200, v)
}
func body(e *core.RequestEvent, v any) error {
	e.Request.Body = http.MaxBytesReader(e.Response, e.Request.Body, 400_000)
	dec := json.NewDecoder(e.Request.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return fail(400, "입력 형식을 확인해 주세요.")
	}
	var extra any
	if err := dec.Decode(&extra); err != io.EOF {
		return fail(400, "잘못된 요청입니다.")
	}
	return nil
}
func actor(e *core.RequestEvent) string {
	if e.Auth == nil {
		return ""
	}
	return e.Auth.Id
}
func Register(app core.App, publicDir string) *Service {
	s := New(app)
	// Never accept client-controlled privilege or membership fields during OAuth signup.
	app.OnRecordAuthWithOAuth2Request("users").BindFunc(func(e *core.RecordAuthWithOAuth2RequestEvent) error {
		if e.ProviderName != "google" {
			return e.ForbiddenError("Google 로그인을 이용해 주세요.", nil)
		}
		e.CreateData = map[string]any{"status": "pending", "role": "member", "name": e.OAuth2User.Name, "emailVisibility": false}
		return e.Next()
	})
	var rateMu sync.Mutex
	attempts := map[string][]time.Time{}
	app.OnServe().BindFunc(func(se *core.ServeEvent) error {
		if err := s.EnsureRatings(); err != nil {
			return err
		}
		se.Router.BindFunc(func(e *core.RequestEvent) error {
			e.Response.Header().Set("X-Content-Type-Options", "nosniff")
			e.Response.Header().Set("Referrer-Policy", "same-origin")
			e.Response.Header().Set("X-Frame-Options", "DENY")
			e.Response.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
			if strings.HasPrefix(e.Request.URL.Path, "/api/") {
				e.Response.Header().Set("Cache-Control", "no-store")
			}
			if os.Getenv("KOKKO_PUBLIC_URL") != "" && strings.HasPrefix(e.Request.URL.Path, "/_") {
				return e.NotFoundError("페이지를 찾을 수 없습니다.", nil)
			}
			return e.Next()
		})
		g := se.Router.Group("/api/kokko")
		g.Bind(apis.RequireAuth("users"))
		g.GET("/me", func(e *core.RequestEvent) error {
			u, err := app.FindRecordById("users", actor(e))
			if err != nil {
				return respond(e, nil, fail(401, "다시 로그인해 주세요."))
			}
			groups := []Group{}
			if u.GetString("status") == "active" {
				groups, err = ownGroups(app, u.Id)
				if err != nil {
					return respond(e, nil, err)
				}
			}
			return e.JSON(200, map[string]any{"id": u.Id, "status": u.GetString("status"), "role": u.GetString("role"), "groups": groups})
		})
		g.POST("/redeem", func(e *core.RequestEvent) error {
			now := time.Now()
			rateMu.Lock()
			limited := false
			for _, key := range []string{"u:" + actor(e), "ip:" + e.RealIP()} {
				recent := []time.Time{}
				for _, t := range attempts[key] {
					if now.Sub(t) < time.Minute {
						recent = append(recent, t)
					}
				}
				if len(recent) >= 10 {
					limited = true
				}
				attempts[key] = append(recent, now)
			}
			if len(attempts) > 1000 {
				for k, v := range attempts {
					if len(v) == 0 || now.Sub(v[len(v)-1]) > time.Minute {
						delete(attempts, k)
					}
				}
			}
			rateMu.Unlock()
			if limited {
				return respond(e, nil, fail(429, "시도가 너무 많습니다. 1분 후 다시 시도해 주세요."))
			}
			var q struct {
				Code string `json:"code"`
			}
			if err := body(e, &q); err != nil {
				return respond(e, nil, err)
			}
			return respond(e, map[string]bool{"ok": true}, s.Redeem(actor(e), q.Code))
		})
		g.GET("/state", func(e *core.RequestEvent) error {
			q := e.Request.URL.Query()
			v, err := s.StateInGroup(actor(e), q.Get("group"), Filters{q.Get("kind"), q.Get("period"), q.Get("player"), q.Get("result")})
			return respond(e, v, err)
		})
		g.POST("/matches", func(e *core.RequestEvent) error {
			var q Mutation
			if err := body(e, &q); err != nil {
				return respond(e, nil, err)
			}
			if context := e.Request.URL.Query().Get("group"); context != "" && groupID(context) != groupID(q.GroupID) {
				return respond(e, nil, fail(400, "경기와 모임을 다시 확인해 주세요."))
			}
			v, err := s.Mutate(actor(e), q)
			return respond(e, v, err)
		})
		g.GET("/matches/{id}/revisions", func(e *core.RequestEvent) error {
			rows, err := s.Revisions(actor(e), e.Request.URL.Query().Get("group"), e.Request.PathValue("id"))
			return respond(e, rows, err)
		})
		g.GET("/invitations", func(e *core.RequestEvent) error {
			v, err := s.GroupInvitations(actor(e), e.Request.URL.Query().Get("group"))
			return respond(e, v, err)
		})
		g.POST("/invitations", func(e *core.RequestEvent) error {
			v, err := s.CreateGroupInvitation(actor(e), e.Request.URL.Query().Get("group"), false)
			return respond(e, map[string]string{"code": v}, err)
		})
		g.DELETE("/invitations/{id}", func(e *core.RequestEvent) error {
			return respond(e, map[string]bool{"ok": true}, s.DisableGroupInvitation(actor(e), e.Request.URL.Query().Get("group"), e.Request.PathValue("id")))
		})
		g.PATCH("/members/{id}/nickname", func(e *core.RequestEvent) error {
			var q struct {
				Nickname string `json:"nickname"`
			}
			if err := body(e, &q); err != nil {
				return respond(e, nil, err)
			}
			return respond(e, map[string]bool{"ok": true}, s.RenameGroupMemberAsAdmin(actor(e), e.Request.URL.Query().Get("group"), e.Request.PathValue("id"), q.Nickname))
		})
		g.PATCH("/profile", func(e *core.RequestEvent) error {
			var q struct {
				Nickname string `json:"nickname"`
				Avatar   string `json:"avatar"`
			}
			if err := body(e, &q); err != nil {
				return respond(e, nil, err)
			}
			q.Nickname = strings.TrimSpace(q.Nickname)
			if utf8.RuneCountInString(q.Nickname) < 1 || utf8.RuneCountInString(q.Nickname) > 20 {
				return respond(e, nil, fail(400, "닉네임은 1~20자로 입력해 주세요."))
			}
			if q.Avatar != "" {
				parts := strings.SplitN(q.Avatar, ",", 2)
				if len(parts) != 2 || (parts[0] != "data:image/png;base64" && parts[0] != "data:image/jpeg;base64") {
					return respond(e, nil, fail(400, "PNG 또는 JPEG 이미지를 선택해 주세요."))
				}
				data, err := base64.StdEncoding.DecodeString(parts[1])
				if err != nil || len(data) > 200_000 {
					return respond(e, nil, fail(400, "프로필 이미지는 200KB 이하여야 합니다."))
				}
				cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
				if err != nil || (format != "png" && format != "jpeg") || cfg.Width > 512 || cfg.Height > 512 {
					return respond(e, nil, fail(400, "이미지는 가로·세로 512픽셀 이하여야 합니다."))
				}
			}
			err := app.RunInTransaction(func(tx core.App) error {
				if _, err := member(tx, actor(e), false); err != nil {
					return err
				}
				if err := exec(tx, "UPDATE kokko_profiles SET nickname={:n},avatar={:a} WHERE id={:id}", dbx.Params{"n": q.Nickname, "a": q.Avatar, "id": actor(e)}); err != nil {
					return err
				}
				return profileChanged(tx, actor(e))
			})
			return respond(e, map[string]bool{"ok": true}, err)
		})
		se.Router.GET("/{path...}", func(e *core.RequestEvent) error {
			p := e.Request.PathValue("path")
			if p == "api" || strings.HasPrefix(p, "api/") || strings.HasPrefix(p, "_") {
				return e.NotFoundError("페이지를 찾을 수 없습니다.", nil)
			}
			if p == "" {
				p = "index.html"
			}
			if strings.Contains(p, "..") {
				return e.NotFoundError("페이지를 찾을 수 없습니다.", nil)
			}
			fs := os.DirFS(publicDir)
			if _, err := os.Stat(publicDir + "/" + p); err != nil {
				if path.Ext(p) != "" {
					return e.NotFoundError("파일을 찾을 수 없습니다.", nil)
				}
				p = "index.html"
			}
			if p == "index.html" {
				e.Response.Header().Set("Cache-Control", "no-cache")
			}
			return e.FileFS(fs, p)
		})
		return se.Next()
	})
	return s
}
