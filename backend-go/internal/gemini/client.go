// Package gemini is a small server-side client for Google's Generative
// Language API. It exists so that the Gemini API key lives only on the
// server; browsers call our own Go endpoints instead of Google directly.
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client talks to the Google Generative Language API.
type Client struct {
	apiKey     string
	model      string
	baseURL    string
	httpClient *http.Client
}

// Config bundles the knobs the client needs.
type Config struct {
	APIKey  string
	Model   string
	BaseURL string // defaults to https://generativelanguage.googleapis.com
	Timeout time.Duration
}

// New builds a Client from the given config.
func New(cfg Config) *Client {
	base := strings.TrimRight(cfg.BaseURL, "/")
	if base == "" {
		base = "https://generativelanguage.googleapis.com"
	}
	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 45 * time.Second
	}
	model := cfg.Model
	if model == "" {
		model = "gemini-2.5-flash"
	}
	return &Client{
		apiKey:     cfg.APIKey,
		model:      model,
		baseURL:    base,
		httpClient: &http.Client{Timeout: timeout},
	}
}

// Enabled is true when an API key is configured.
func (c *Client) Enabled() bool { return c != nil && c.apiKey != "" }

// Model returns the configured model id.
func (c *Client) Model() string {
	if c == nil {
		return ""
	}
	return c.model
}

// Part is one piece of a Gemini multimodal message.
// Either Text or InlineData should be set on any given part.
type Part struct {
	Text       string      `json:"text,omitempty"`
	InlineData *InlineData `json:"inline_data,omitempty"`
}

// InlineData represents raw base64-encoded media forwarded to the model.
type InlineData struct {
	MimeType string `json:"mime_type"`
	Data     string `json:"data"`
}

// Content is a single turn in a Gemini `contents` array.
type Content struct {
	Role  string `json:"role,omitempty"`
	Parts []Part `json:"parts"`
}

// SystemInstruction is the model's system prompt.
type SystemInstruction struct {
	Parts []Part `json:"parts"`
}

// SafetySetting configures model safety filtering.
type SafetySetting struct {
	Category  string `json:"category"`
	Threshold string `json:"threshold"`
}

// GenerationConfig tweaks decoding behaviour.
type GenerationConfig struct {
	Temperature      *float64 `json:"temperature,omitempty"`
	TopP             *float64 `json:"topP,omitempty"`
	MaxOutputTokens  *int     `json:"maxOutputTokens,omitempty"`
	ResponseMIMEType string   `json:"responseMimeType,omitempty"`
}

// GenerateRequest is the input to GenerateContent.
type GenerateRequest struct {
	SystemInstruction *SystemInstruction `json:"system_instruction,omitempty"`
	Contents          []Content          `json:"contents"`
	GenerationConfig  *GenerationConfig  `json:"generationConfig,omitempty"`
	SafetySettings    []SafetySetting    `json:"safetySettings,omitempty"`
}

type generateResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
		FinishReason string `json:"finishReason"`
	} `json:"candidates"`
	PromptFeedback *struct {
		BlockReason string `json:"blockReason"`
	} `json:"promptFeedback"`
	Error *struct {
		Message string `json:"message"`
		Status  string `json:"status"`
		Code    int    `json:"code"`
	} `json:"error"`
}

// ErrDisabled is returned when the client has no API key configured.
var ErrDisabled = fmt.Errorf("gemini: client disabled (missing API key)")

// Error is a human-readable upstream error.
type Error struct {
	Status  int
	Reason  string
	Message string
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	if e.Message != "" {
		return e.Message
	}
	return e.Reason
}

// GenerateText calls the Gemini generateContent endpoint and returns the
// concatenated text of the first candidate.
func (c *Client) GenerateText(ctx context.Context, req GenerateRequest) (string, error) {
	if !c.Enabled() {
		return "", ErrDisabled
	}
	payload, err := json.Marshal(req)
	if err != nil {
		return "", fmt.Errorf("gemini: marshal: %w", err)
	}

	url := fmt.Sprintf(
		"%s/v1beta/models/%s:generateContent?key=%s",
		c.baseURL, c.model, c.apiKey,
	)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("gemini: build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("gemini: request: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("gemini: read response: %w", err)
	}

	var out generateResponse
	if jerr := json.Unmarshal(body, &out); jerr != nil {
		if resp.StatusCode >= 400 {
			return "", &Error{
				Status:  resp.StatusCode,
				Reason:  fmt.Sprintf("http %d", resp.StatusCode),
				Message: truncate(string(body), 400),
			}
		}
		return "", fmt.Errorf("gemini: decode response: %w", jerr)
	}

	if resp.StatusCode >= 400 {
		msg := ""
		if out.Error != nil {
			msg = out.Error.Message
		}
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d from Gemini", resp.StatusCode)
		}
		return "", &Error{Status: resp.StatusCode, Reason: fmt.Sprintf("http %d", resp.StatusCode), Message: msg}
	}
	if out.PromptFeedback != nil && out.PromptFeedback.BlockReason != "" {
		return "", &Error{
			Status:  http.StatusBadRequest,
			Reason:  "blocked",
			Message: fmt.Sprintf("Gemini blocked the request (%s).", out.PromptFeedback.BlockReason),
		}
	}
	if len(out.Candidates) == 0 {
		return "", &Error{Status: http.StatusBadGateway, Reason: "empty", Message: "Gemini returned no candidates."}
	}

	var sb strings.Builder
	for _, p := range out.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	text := strings.TrimSpace(sb.String())
	if text == "" {
		return "", &Error{Status: http.StatusBadGateway, Reason: "empty", Message: "Gemini returned an empty response."}
	}
	return text, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
