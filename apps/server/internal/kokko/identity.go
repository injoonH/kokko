package kokko

import (
	"database/sql"
	"errors"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/auth"
)

func init() {
	// v0.40.5 has no scopes option in OAuth2ProviderConfig. Keep its Kakao
	// implementation and PKCE, replacing only the default requested permissions.
	factory := auth.Providers[auth.NameKakao]
	auth.Providers[auth.NameKakao] = func() auth.Provider {
		provider := factory()
		provider.SetScopes([]string{"profile_nickname"})
		return provider
	}
}

type IdentityOptions struct {
	PublicSignup bool
}

func supportedProvider(name string) bool { return name == "google" || name == "kakao" }

// ConfigureOAuth replaces the provider list from deployment configuration. A
// missing credential pair disables only that provider, never the other one.
func ConfigureOAuth(app core.App, googleID, googleSecret, kakaoID, kakaoSecret string) error {
	c, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		return err
	}
	c.OAuth2.Providers = nil
	if googleID != "" && googleSecret != "" {
		c.OAuth2.Providers = append(c.OAuth2.Providers, core.OAuth2ProviderConfig{Name: "google", ClientId: googleID, ClientSecret: googleSecret})
	}
	if kakaoID != "" && kakaoSecret != "" {
		// Email, profile images and Kakao Talk permissions aren't needed to play.
		c.OAuth2.Providers = append(c.OAuth2.Providers, core.OAuth2ProviderConfig{Name: "kakao", ClientId: kakaoID, ClientSecret: kakaoSecret})
	}
	c.OAuth2.Enabled = len(c.OAuth2.Providers) > 0
	return app.Save(c)
}

func configuredProviders(app core.App) ([]string, error) {
	c, err := app.FindCollectionByNameOrId("users")
	out := []string{}
	if err != nil || !c.OAuth2.Enabled {
		return out, err
	}
	for _, p := range c.OAuth2.Providers {
		if supportedProvider(p.Name) {
			out = append(out, p.Name)
		}
	}
	return out, nil
}

func identityProviders(app core.App, u *core.Record) ([]string, error) {
	links, err := app.FindAllExternalAuthsByRecord(u)
	out := []string{}
	for _, link := range links {
		if supportedProvider(link.Provider()) && !slices.Contains(out, link.Provider()) {
			out = append(out, link.Provider())
		}
	}
	slices.Sort(out)
	return out, err
}

// PocketBase exchanges the code and fetches the provider's identity before this
// hook. Its stock submit implicitly links by email and can remove other links
// from unverified records. Use stable provider IDs and explicit authenticated
// linking instead, then retain PocketBase's normal auth-rule/MFA/token response.
func (s *Service) authenticateOAuth(e *core.RecordAuthWithOAuth2RequestEvent) error {
	if !supportedProvider(e.ProviderName) || e.OAuth2User.Id == "" || (e.ProviderName == "kakao" && e.OAuth2User.Id == "0") {
		return e.ForbiddenError("Google 또는 카카오 로그인을 이용해 주세요.", nil)
	}
	mode := e.Request.URL.Query().Get("kokkoMode")
	if mode != "" && mode != "link" {
		return e.BadRequestError("인증 요청을 다시 시작해 주세요.", nil)
	}
	linking := mode == "link"
	if (linking && e.Auth == nil) || (!linking && e.Auth != nil) {
		return e.ForbiddenError("로그인한 계정의 설정에서 연결을 시작해 주세요.", nil)
	}
	var result *core.Record
	isNew := false
	err := s.App.RunInTransaction(func(tx core.App) error {
		identity, err := tx.FindFirstExternalAuthByExpr(dbx.HashExp{"collectionRef": e.Collection.Id, "provider": e.ProviderName, "providerId": e.OAuth2User.Id})
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if linking {
			result, err = member(tx, actor(e.RequestEvent), false)
			if err != nil {
				return err
			}
			if identity != nil && identity.RecordRef() != result.Id {
				return fail(409, "이미 다른 회원에게 연결된 계정입니다. 계정을 자동으로 합치지 않아요.")
			}
			links, err := identityProviders(tx, result)
			if err != nil {
				return err
			}
			if identity == nil && slices.Contains(links, e.ProviderName) {
				return fail(409, "이미 같은 로그인 방식이 연결되어 있습니다.")
			}
		} else if identity != nil {
			result, err = tx.FindRecordById(e.Collection, identity.RecordRef())
			if err != nil {
				return err
			}
		} else {
			if e.OAuth2User.Email != "" {
				_, err := tx.FindAuthRecordByEmail(e.Collection, e.OAuth2User.Email)
				if err == nil {
					return fail(409, "기존 로그인 방식으로 로그인한 뒤 설정에서 계정을 연결해 주세요. 이메일만으로 연결하지 않아요.")
				}
				if !errors.Is(err, sql.ErrNoRows) {
					return err
				}
			}
			result = core.NewRecord(e.Collection)
			result.SetRandomPassword()
			result.SetEmail(e.OAuth2User.Email) // Providers return only verified email.
			result.SetVerified(e.OAuth2User.Email != "")
			result.Set("emailVisibility", false)
			result.Set("status", "pending")
			result.Set("role", "member")
			name := strings.TrimSpace(e.OAuth2User.Name)
			if name == "" {
				name = strings.TrimSpace(e.OAuth2User.Username)
			}
			// Kakao's deprecated properties.nickname may be absent in newer apps.
			if name == "" && e.ProviderName == "kakao" {
				account, _ := e.OAuth2User.RawUser["kakao_account"].(map[string]any)
				profile, _ := account["profile"].(map[string]any)
				name, _ = profile["nickname"].(string)
			}
			runes := []rune(strings.TrimSpace(name))
			result.Set("name", string(runes[:min(80, len(runes))]))
			if err := tx.Save(result); err != nil {
				return err
			}
			isNew = true
		}
		if result.GetString("status") == "suspended" {
			return fail(403, "이용이 중지된 계정입니다.")
		}
		if identity == nil {
			identity = core.NewExternalAuth(tx)
			identity.SetCollectionRef(e.Collection.Id)
			identity.SetRecordRef(result.Id)
			identity.SetProvider(e.ProviderName)
			identity.SetProviderId(e.OAuth2User.Id)
			return tx.Save(identity)
		}
		return nil
	})
	if err != nil {
		return respond(e.RequestEvent, nil, err)
	}
	e.Record, e.IsNewRecord = result, isNew
	// Never send provider access/refresh tokens or private provider metadata to JS.
	return apis.RecordAuthResponse(e.RequestEvent, result, core.MFAMethodOAuth2, map[string]bool{"isNew": isNew})
}

func (s *Service) Onboard(actor, nickname string) error {
	if !s.PublicSignup {
		return fail(403, "지금은 모임의 초대로 가입할 수 있어요.")
	}
	nickname = strings.TrimSpace(nickname)
	if n := utf8.RuneCountInString(nickname); n < 1 || n > 20 {
		return fail(400, "닉네임은 1~20자로 입력해 주세요.")
	}
	return s.App.RunInTransaction(func(tx core.App) error {
		u, err := tx.FindRecordById("users", actor)
		if err != nil {
			return fail(401, "다시 로그인해 주세요.")
		}
		if u.GetString("status") == "suspended" {
			return fail(403, "이용이 중지된 계정입니다.")
		}
		providers, err := identityProviders(tx, u)
		if err != nil {
			return err
		}
		if len(providers) == 0 {
			return fail(403, "Google 또는 카카오 로그인을 먼저 완료해 주세요.")
		}
		// Retries cannot overwrite a chosen nickname/avatar or reset privileges.
		if u.GetString("status") == "active" {
			return nil
		}
		if err := exec(tx, "INSERT INTO kokko_profiles(id,nickname) VALUES({:id},{:n}) ON CONFLICT(id) DO NOTHING", dbx.Params{"id": u.Id, "n": nickname}); err != nil {
			return err
		}
		u.Set("status", "active")
		u.Set("role", "member")
		return tx.Save(u) // No membership, match, rating or group revision is changed.
	})
}
