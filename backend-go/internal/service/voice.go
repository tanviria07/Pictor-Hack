// Voice coach service used by the /api/voice/* endpoints. It holds prompts
// for Jose and delegates to the server-side Gemini client so the browser
// never sees the API key.
package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"pictorhack/backend/internal/gemini"
)

// MaxAudioBytes caps the decoded size of inbound audio for /voice/turn
// requests. 6 MB comfortably covers 20s of opus audio but stops abuse.
const MaxAudioBytes = 6 * 1024 * 1024

// MaxContextBytes caps the coach context payload size.
const MaxContextBytes = 12 * 1024

// MaxTranscriptBytes caps plain-text transcripts passed to /voice/turn.
const MaxTranscriptBytes = 4 * 1024

// systemPrompt is the Jose voice coach system prompt (kept server-side so
// it can't be swapped by a client).
const systemPrompt = `You are Jose, an expert coding-interview coach embedded in a practice app.
You are delivered via text-to-speech, so responses are spoken out loud.

Rules:
- Respond in 1-3 short sentences (roughly 20-45 words) — speech, not prose.
- Never output markdown, code blocks, bullet lists, or emojis.
- Never reveal or write out the full solution; give conceptual hints only.
- If the user is stuck, first ask "What approach comes to mind?" before hinting.
- If the user describes their code, briefly evaluate the idea and suggest one concrete next step.
- When asked, discuss time/space complexity in plain language (e.g. "linear time, constant space").
- Stay calm, direct, and encouraging — like a real interviewer pairing with a candidate.
- If the user asks something unrelated to the current problem, still answer briefly and helpfully.`

const suggestionsPrompt = `You suggest 3 short follow-up questions a student might ask their coding-interview coach Jose right now, given the problem and code snapshot below.

Rules:
- Return ONLY a JSON object of the form {"questions":["q1","q2","q3"]}.
- Each question is 3 to 10 words, conversational, first person ("Should I", "What's", "Am I", "How do I", "Is this", etc).
- The three questions must be varied: mix high-level approach, complexity, an edge case, a next step, or an intuition check.
- No markdown, no emojis, no trailing punctuation clutter.
- If no problem is selected, ask generally helpful coding-coach questions.`

var safetySettings = []gemini.SafetySetting{
	{Category: "HARM_CATEGORY_HARASSMENT", Threshold: "BLOCK_ONLY_HIGH"},
	{Category: "HARM_CATEGORY_HATE_SPEECH", Threshold: "BLOCK_ONLY_HIGH"},
	{Category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", Threshold: "BLOCK_ONLY_HIGH"},
	{Category: "HARM_CATEGORY_DANGEROUS_CONTENT", Threshold: "BLOCK_ONLY_HIGH"},
}

// VoiceService handles /api/voice/* business logic.
type VoiceService struct {
	Gemini *gemini.Client
}

// NewVoiceService builds a voice service. Pass a nil client to disable.
func NewVoiceService(c *gemini.Client) *VoiceService {
	return &VoiceService{Gemini: c}
}

// Enabled is true when the Gemini client is configured.
func (s *VoiceService) Enabled() bool {
	return s != nil && s.Gemini != nil && s.Gemini.Enabled()
}

// Turn is one coach exchange: what the user said and Jose's reply.
type Turn struct {
	Transcript string `json:"transcript"`
	Reply      string `json:"reply"`
}

// TurnRequest mirrors the browser request body for POST /api/voice/turn.
// Exactly one of Audio or Transcript should be populated.
type TurnRequest struct {
	Context     string `json:"context"`
	Transcript  string `json:"transcript"`
	AudioBase64 string `json:"audio_base64"`
	AudioMime   string `json:"audio_mime"`
}

// ErrEmptyInput is returned when the request has neither audio nor text.
var ErrEmptyInput = errors.New("voice: request must include audio or transcript")

// ErrInputTooLarge is returned when a payload exceeds the configured caps.
var ErrInputTooLarge = errors.New("voice: input too large")

// ErrBadAudio is returned for malformed audio payloads.
var ErrBadAudio = errors.New("voice: invalid audio payload")

// HandleTurn produces a Jose reply from either an audio clip or a plain
// transcript. When audio is present the model is asked to transcribe AND
// reply in a single structured JSON answer.
func (s *VoiceService) HandleTurn(ctx context.Context, req TurnRequest) (Turn, error) {
	if !s.Enabled() {
		return Turn{}, gemini.ErrDisabled
	}
	if len(req.Context) > MaxContextBytes {
		return Turn{}, ErrInputTooLarge
	}
	hasAudio := strings.TrimSpace(req.AudioBase64) != ""
	hasText := strings.TrimSpace(req.Transcript) != ""
	if !hasAudio && !hasText {
		return Turn{}, ErrEmptyInput
	}
	if hasText && len(req.Transcript) > MaxTranscriptBytes {
		return Turn{}, ErrInputTooLarge
	}

	if hasAudio {
		return s.handleAudioTurn(ctx, req)
	}
	return s.handleTextTurn(ctx, req)
}

func (s *VoiceService) handleTextTurn(ctx context.Context, req TurnRequest) (Turn, error) {
	temp := 0.7
	topP := 0.9
	maxTokens := 220

	r := gemini.GenerateRequest{
		SystemInstruction: &gemini.SystemInstruction{
			Parts: []gemini.Part{{Text: systemPrompt}},
		},
		Contents: []gemini.Content{
			{
				Role: "user",
				Parts: []gemini.Part{
					{Text: fmt.Sprintf("%s\n\nUser said: %s", req.Context, req.Transcript)},
				},
			},
		},
		GenerationConfig: &gemini.GenerationConfig{
			Temperature:     &temp,
			TopP:            &topP,
			MaxOutputTokens: &maxTokens,
		},
		SafetySettings: safetySettings,
	}
	reply, err := s.Gemini.GenerateText(ctx, r)
	if err != nil {
		return Turn{}, err
	}
	return Turn{Transcript: strings.TrimSpace(req.Transcript), Reply: reply}, nil
}

func (s *VoiceService) handleAudioTurn(ctx context.Context, req TurnRequest) (Turn, error) {
	mime := strings.TrimSpace(req.AudioMime)
	if mime == "" {
		mime = "audio/webm"
	}
	if !strings.HasPrefix(mime, "audio/") {
		return Turn{}, ErrBadAudio
	}
	decoded, err := base64.StdEncoding.DecodeString(req.AudioBase64)
	if err != nil {
		return Turn{}, ErrBadAudio
	}
	if len(decoded) == 0 {
		return Turn{}, ErrBadAudio
	}
	if len(decoded) > MaxAudioBytes {
		return Turn{}, ErrInputTooLarge
	}

	instruction := strings.Join([]string{
		systemPrompt,
		"",
		"The user will send a short audio clip of their question. Do two things:",
		"1) Transcribe exactly what they said (verbatim, English).",
		"2) Write your Jose reply, obeying every rule above (spoken, 1-3 short sentences, no markdown, no code blocks).",
		"",
		"Respond ONLY with a single JSON object on one line, no prose and no markdown fences:",
		`{"transcript":"...","reply":"..."}`,
		"If the audio is silent or unintelligible, return:",
		`{"transcript":"","reply":"I couldn't hear you clearly. Try again?"}`,
	}, "\n")

	temp := 0.6
	topP := 0.9
	maxTokens := 400

	r := gemini.GenerateRequest{
		Contents: []gemini.Content{
			{
				Role: "user",
				Parts: []gemini.Part{
					{Text: instruction},
					{Text: fmt.Sprintf("Context for your reply:\n%s", req.Context)},
					{InlineData: &gemini.InlineData{MimeType: mime, Data: req.AudioBase64}},
				},
			},
		},
		GenerationConfig: &gemini.GenerationConfig{
			Temperature:      &temp,
			TopP:             &topP,
			MaxOutputTokens:  &maxTokens,
			ResponseMIMEType: "application/json",
		},
		SafetySettings: safetySettings,
	}

	raw, err := s.Gemini.GenerateText(ctx, r)
	if err != nil {
		return Turn{}, err
	}

	jsonText := stripCodeFences(raw)
	var parsed Turn
	if jerr := json.Unmarshal([]byte(jsonText), &parsed); jerr != nil {
		// Fall back to using the raw text as Jose's reply so the
		// conversation keeps flowing even if the model slips format.
		return Turn{Reply: raw}, nil
	}
	parsed.Transcript = strings.TrimSpace(parsed.Transcript)
	parsed.Reply = strings.TrimSpace(parsed.Reply)
	if parsed.Reply == "" {
		return Turn{}, fmt.Errorf("voice: empty reply from Gemini")
	}
	return parsed, nil
}

// SuggestRequest is the body of POST /api/voice/suggest.
type SuggestRequest struct {
	Context string `json:"context"`
}

// Suggestions is the response payload.
type Suggestions struct {
	Questions []string `json:"questions"`
}

// Suggest returns a small list of follow-up questions. It swallows any
// upstream error and returns an empty list, keeping the UX graceful.
func (s *VoiceService) Suggest(ctx context.Context, req SuggestRequest) Suggestions {
	if !s.Enabled() {
		return Suggestions{Questions: []string{}}
	}
	if len(req.Context) > MaxContextBytes {
		return Suggestions{Questions: []string{}}
	}

	temp := 0.95
	topP := 0.95
	maxTokens := 180

	r := gemini.GenerateRequest{
		Contents: []gemini.Content{
			{
				Role: "user",
				Parts: []gemini.Part{
					{Text: suggestionsPrompt},
					{Text: fmt.Sprintf("Snapshot:\n%s", req.Context)},
				},
			},
		},
		GenerationConfig: &gemini.GenerationConfig{
			Temperature:      &temp,
			TopP:             &topP,
			MaxOutputTokens:  &maxTokens,
			ResponseMIMEType: "application/json",
		},
		SafetySettings: safetySettings,
	}
	raw, err := s.Gemini.GenerateText(ctx, r)
	if err != nil {
		return Suggestions{Questions: []string{}}
	}
	jsonText := stripCodeFences(raw)
	var parsed struct {
		Questions []string `json:"questions"`
	}
	if jerr := json.Unmarshal([]byte(jsonText), &parsed); jerr != nil {
		return Suggestions{Questions: []string{}}
	}
	out := make([]string, 0, 3)
	for _, q := range parsed.Questions {
		q = strings.TrimSpace(q)
		if q == "" || len(q) > 80 {
			continue
		}
		out = append(out, q)
		if len(out) >= 3 {
			break
		}
	}
	return Suggestions{Questions: out}
}

func stripCodeFences(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "```") {
		return trimmed
	}
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```JSON")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(trimmed, "```")
	return strings.TrimSpace(trimmed)
}
