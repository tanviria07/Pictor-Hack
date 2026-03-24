// Package deepseek calls the DeepSeek chat API for interviewer-style wording only.
// It must never be used to infer correctness; evaluation JSON is authoritative.
package deepseek

import (
	"bytes"
	"encoding/json"
	"fmt"
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
			Timeout: 60 * time.Second,
		},
	}
}

// Enabled is true when an API key is present.
func (c *Client) Enabled() bool { return c.apiKey != "" }

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

// CoachFeedback requests natural-language interviewer notes or hints.
// Correctness must not be derived from the model output.
func (c *Client) CoachFeedback(systemPrompt, userContent string) (string, error) {
	if !c.Enabled() {
		return "", fmt.Errorf("deepseek disabled")
	}
	payload, err := json.Marshal(chatRequest{
		Model: c.model,
		Messages: []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(payload))
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
	var out chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	if out.Error != nil {
		return "", fmt.Errorf("deepseek: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return "", fmt.Errorf("deepseek: empty choices")
	}
	return strings.TrimSpace(out.Choices[0].Message.Content), nil
}
