// Package deepseek calls the DeepSeek chat API for interviewer-style wording only.
// It must never be used to infer correctness; evaluation JSON is authoritative.
package deepseek

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"josemorinho/backend/internal/config"
)

// Client is configured from backend env (API key never exposed to browsers).
type Client struct {
	apiKey     string
	baseURL    string
	httpClient *http.Client
	model      string
}

// New builds a client from loaded config.
func New(cfg config.Config) *Client {
	return &Client{
		apiKey:  cfg.DeepSeekKey,
		baseURL: cfg.DeepSeekURL,
		model:   cfg.DeepSeekModel,
		httpClient: &http.Client{
			Timeout: 90 * time.Second,
		},
	}
}

// Enabled is true when an API key is present.
func (c *Client) Enabled() bool { return c.apiKey != "" }

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type chatRequest struct {
	Model          string            `json:"model"`
	Messages       []chatMessage     `json:"messages"`
	ResponseFormat *responseFormat   `json:"response_format,omitempty"`
	Temperature    *float64          `json:"temperature,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// CoachFeedback requests natural-language interviewer notes for POST /api/run.
func (c *Client) CoachFeedback(systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(context.Background(), chatParams{
		System: systemPrompt,
		User:   userContent,
		JSON:   false,
	})
}

// HintJSONCompletion requests JSON-only hint output for POST /api/hint.
func (c *Client) HintJSONCompletion(ctx context.Context, systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(ctx, chatParams{
		System: systemPrompt,
		User:   userContent,
		JSON:   true,
	})
}

type chatParams struct {
	System string
	User   string
	JSON   bool
}

func (c *Client) chatCompletion(ctx context.Context, p chatParams) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("deepseek disabled")
	}
	reqBody := chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: p.System},
			{Role: "user", Content: p.User},
		},
	}
	if p.JSON {
		reqBody.ResponseFormat = &responseFormat{Type: "json_object"}
		t := 0.3
		reqBody.Temperature = &t
	}
	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("deepseek http %d: %s", resp.StatusCode, truncate(string(body), 800))
	}
	var out chatResponse
	if err := json.Unmarshal(body, &out); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if out.Error != nil {
		return "", fmt.Errorf("deepseek: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("deepseek: empty choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}
