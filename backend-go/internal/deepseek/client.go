// Package deepseek calls the DeepSeek chat API for interviewer-style wording only.
// It must never be used to infer correctness; evaluation JSON is authoritative.
package deepseek

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"pictorhack/backend/internal/config"
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
	Model          string          `json:"model"`
	Messages       []chatMessage   `json:"messages"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
	Temperature    *float64        `json:"temperature,omitempty"`
	MaxTokens      int             `json:"max_tokens,omitempty"`
	TopP           float64         `json:"top_p,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// GetHint returns a concise coding-interview hint for both manual hint requests
// and proactive WebSocket interviewer nudges.
func GetHint(problemID, code, errorType string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	apiKey := strings.TrimSpace(os.Getenv("DEEPSEEK_API_KEY"))
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("VITE_DEEPSEEK_API_KEY"))
	}
	if apiKey == "" {
		return deterministicHint(errorType), nil
	}

	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("DEEPSEEK_API_URL")), "/")
	if baseURL == "" {
		baseURL = "https://api.deepseek.com"
	}
	model := strings.TrimSpace(os.Getenv("DEEPSEEK_MODEL"))
	if model == "" {
		model = "deepseek-chat"
	}

	userPrompt := fmt.Sprintf(
		"Problem: %s. User code: %s. Error/context: %s. Give a short, helpful hint (max 2 sentences).",
		problemID,
		truncate(code, 4000),
		errorType,
	)
	reqBody := chatRequest{
		Model: model,
		Messages: []chatMessage{
			{Role: "system", Content: "You are a coding interview coach. Provide only hints, never the full solution."},
			{Role: "user", Content: userPrompt},
		},
		MaxTokens: 120,
	}
	temp := 0.4
	reqBody.Temperature = &temp

	payload, err := json.Marshal(reqBody)
	if err != nil {
		slog.Error("deepseek hint marshal failed", "err", err)
		return deterministicHint(errorType), nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/v1/chat/completions", bytes.NewReader(payload))
	if err != nil {
		slog.Error("deepseek hint request build failed", "err", err)
		return deterministicHint(errorType), nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err != nil {
		slog.Error("deepseek hint request failed", "err", err)
		return deterministicHint(errorType), nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		slog.Error("deepseek hint read failed", "err", err)
		return deterministicHint(errorType), nil
	}
	if resp.StatusCode >= 400 {
		slog.Error("deepseek hint http error", "status", resp.StatusCode, "body", truncate(string(body), 800))
		return deterministicHint(errorType), nil
	}

	var out chatResponse
	if err := json.Unmarshal(body, &out); err != nil {
		slog.Error("deepseek hint decode failed", "err", err)
		return deterministicHint(errorType), nil
	}
	if out.Error != nil {
		slog.Error("deepseek hint api error", "err", out.Error.Message)
		return deterministicHint(errorType), nil
	}
	if len(out.Choices) == 0 {
		slog.Error("deepseek hint empty choices")
		return deterministicHint(errorType), nil
	}

	hint := strings.TrimSpace(out.Choices[0].Message.Content)
	if hint == "" {
		return deterministicHint(errorType), nil
	}
	return limitSentences(hint, 2), nil
}

func deterministicHint(errorType string) string {
	switch strings.TrimSpace(errorType) {
	case "runtime_error":
		return "Check the exact line that crashes and verify your indexes or nil values before that operation."
	case "partial":
		return "Your approach works for some cases, so look for an edge case that changes the input size, ordering, or duplicates."
	case "correct":
		return "Nice work. Now test one unusual edge case and explain why your complexity still holds."
	case "wrong":
		return "Trace one small failing example by hand and compare each variable update against the problem statement."
	default:
		return "Break the problem into smaller steps and verify the next assumption your code depends on."
	}
}

func limitSentences(text string, max int) string {
	if max <= 0 {
		return strings.TrimSpace(text)
	}
	count := 0
	for i, r := range text {
		if r == '.' || r == '!' || r == '?' {
			count++
			if count >= max {
				return strings.TrimSpace(text[:i+1])
			}
		}
	}
	return strings.TrimSpace(text)
}

// CoachFeedback requests natural-language interviewer notes for POST /api/run.
func (c *Client) CoachFeedback(systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(context.Background(), chatParams{
		System: systemPrompt,
		User:   userContent,
		JSON:   false,
	})
}

// CoachTurn requests a short interactive Jose coach response.
func (c *Client) CoachTurn(ctx context.Context, systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(ctx, chatParams{
		System:      systemPrompt,
		User:        userContent,
		JSON:        false,
		Temperature: 0.7,
		MaxTokens:   220,
		TopP:        0.9,
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

// InlineHintCompletion requests JSON-only inline hint output for POST /api/inline-hint.
func (c *Client) InlineHintCompletion(ctx context.Context, systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(ctx, chatParams{
		System: systemPrompt,
		User:   userContent,
		JSON:   true,
	})
}

// TraceJSONCompletion requests JSON-only interview trace output for POST /api/trace.
func (c *Client) TraceJSONCompletion(ctx context.Context, systemPrompt, userContent string) (string, error) {
	return c.chatCompletion(ctx, chatParams{
		System: systemPrompt,
		User:   userContent,
		JSON:   true,
	})
}

type chatParams struct {
	System      string
	User        string
	JSON        bool
	Temperature float64
	MaxTokens   int
	TopP        float64
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
	if p.Temperature > 0 {
		reqBody.Temperature = &p.Temperature
	}
	if p.MaxTokens > 0 {
		reqBody.MaxTokens = p.MaxTokens
	}
	if p.TopP > 0 {
		reqBody.TopP = p.TopP
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
	return s[:n] + "â€¦"
}
