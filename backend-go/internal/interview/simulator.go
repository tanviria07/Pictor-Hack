package interview

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"pictorhack/backend/internal/dto"
)

const (
	defaultHintAPIURL   = "http://127.0.0.1:8080/api/hint"
	hintAPITimeout      = 2 * time.Second
	runReminderDelay    = 30 * time.Second
	websocketWriteWait  = 5 * time.Second
	eventBufferSize     = 16
	outboundBufferSize  = 8
	maxIncomingMsgBytes = 1 << 20
)

const genericHintFallback = "I see you're stuck. Try breaking the problem into smaller steps."

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool {
			return true
		},
	}

	errorHints = map[string]string{
		"runtime_error": "Runtime error again – check your list indices.",
		"wrong":         "Still not passing tests. Review the problem statement edge cases.",
		"partial":       "You're passing some tests. Look at the hidden test cases.",
	}
)

// Event is the JSON envelope accepted from the React client.
type Event struct {
	Type      string `json:"type"`
	ProblemID string `json:"problem_id,omitempty"`
	Line      int    `json:"line,omitempty"`
	Seconds   int    `json:"seconds,omitempty"`
	ErrorType string `json:"error_type,omitempty"`
	Code      string `json:"code,omitempty"`
}

// SessionState is intentionally small and connection-scoped.
type SessionState struct {
	ProblemID     string
	CurrentLine   int
	DwellSeconds  int
	LastError     string
	LastRunCode   string
	ErrorCount    int
	CodeSnapshot  string
	LastDwellLine int
}

type interviewerMessage struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type hintRequest struct {
	ProblemID  string                   `json:"problem_id"`
	Code       string                   `json:"code"`
	ErrorType  string                   `json:"error_type"`
	Evaluation dto.StructuredEvaluation `json:"evaluation,omitempty"`
}

type hintResponse struct {
	Hint                string `json:"hint"`
	InterviewerFeedback string `json:"interviewer_feedback"`
}

type simulator struct {
	conn       *websocket.Conn
	ctx        context.Context
	cancel     context.CancelFunc
	logger     *slog.Logger
	state      SessionState
	hintAPIURL string
	events     chan Event
	outbound   chan interviewerMessage
}

// WebSocketHandler upgrades /ws/interview requests and runs one isolated
// interview simulator session per WebSocket connection.
func WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("interview websocket upgrade failed", "err", err)
		return
	}

	ctx, cancel := context.WithCancel(r.Context())
	s := &simulator{
		conn:       conn,
		ctx:        ctx,
		cancel:     cancel,
		logger:     slog.Default().With("component", "interview_simulator"),
		hintAPIURL: defaultHintAPIURL,
		events:     make(chan Event, eventBufferSize),
		outbound:   make(chan interviewerMessage, outboundBufferSize),
	}
	s.run()
}

func (s *simulator) run() {
	defer func() {
		s.cancel()
		_ = s.conn.Close()
		s.logger.Debug("interview websocket session closed")
	}()

	go s.readLoop()
	go s.writeLoop()

	var runReminder <-chan time.Time
	var runTimer *time.Timer

	stopRunReminder := func() {
		if runTimer == nil {
			return
		}
		if !runTimer.Stop() {
			select {
			case <-runTimer.C:
			default:
			}
		}
		runTimer = nil
		runReminder = nil
	}

	resetRunReminder := func() {
		stopRunReminder()
		runTimer = time.NewTimer(runReminderDelay)
		runReminder = runTimer.C
	}

	for {
		select {
		case <-s.ctx.Done():
			stopRunReminder()
			return
		case <-runReminder:
			runTimer = nil
			runReminder = nil
			s.send("Your code changed – consider running it to see if the new version fixes the issue.")
		case ev, ok := <-s.events:
			if !ok {
				stopRunReminder()
				return
			}
			s.handleEvent(ev, resetRunReminder, stopRunReminder)
		}
	}
}

func (s *simulator) readLoop() {
	defer func() {
		s.cancel()
		close(s.events)
	}()

	s.conn.SetReadLimit(maxIncomingMsgBytes)
	for {
		var ev Event
		if err := s.conn.ReadJSON(&ev); err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				s.logger.Debug("interview websocket read stopped", "err", err)
			}
			return
		}

		select {
		case s.events <- ev:
		case <-s.ctx.Done():
			return
		}
	}
}

func (s *simulator) writeLoop() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case msg := <-s.outbound:
			if err := s.conn.SetWriteDeadline(time.Now().Add(websocketWriteWait)); err != nil {
				s.logger.Debug("interview websocket write deadline failed", "err", err)
				s.cancel()
				return
			}
			if err := s.conn.WriteJSON(msg); err != nil {
				s.logger.Debug("interview websocket write failed", "err", err)
				s.cancel()
				return
			}
		}
	}
}

func (s *simulator) handleEvent(ev Event, resetRunReminder, stopRunReminder func()) {
	switch ev.Type {
	case "start_session":
		s.state = SessionState{ProblemID: strings.TrimSpace(ev.ProblemID)}
		s.logger.Debug("interview session started", "problem_id", s.state.ProblemID)
	case "cursor_move":
		if ev.Line > 0 {
			s.state.CurrentLine = ev.Line
		}
	case "dwell_tick":
		s.handleDwellTick(ev)
	case "code_change":
		s.state.CodeSnapshot = ev.Code
		resetRunReminder()
	case "run_attempt":
		stopRunReminder()
		s.handleRunAttempt(ev)
	default:
		s.logger.Debug("unknown interview event", "type", ev.Type)
	}
}

func (s *simulator) handleDwellTick(ev Event) {
	if ev.Line > 0 {
		s.state.CurrentLine = ev.Line
	}
	if ev.Seconds > 0 {
		s.state.DwellSeconds = ev.Seconds
	}

	if s.state.CurrentLine <= 0 || s.state.DwellSeconds < 60 {
		return
	}
	if s.state.LastDwellLine == s.state.CurrentLine {
		return
	}

	s.state.LastDwellLine = s.state.CurrentLine
	s.send(fmt.Sprintf("You've been on line %d for a while. Would you like a hint about the loop condition?", s.state.CurrentLine))
}

func (s *simulator) handleRunAttempt(ev Event) {
	errorType := strings.TrimSpace(ev.ErrorType)
	if !isValidErrorType(errorType) {
		s.logger.Debug("invalid run_attempt error_type", "error_type", ev.ErrorType)
		return
	}

	s.state.LastRunCode = ev.Code
	if ev.Code != "" {
		s.state.CodeSnapshot = ev.Code
	}

	if errorType == "correct" {
		s.state.LastError = errorType
		s.state.ErrorCount = 0
		s.send("Great! All tests passed. Can you think of an edge case where this might break?")
		return
	}

	if errorType == s.state.LastError {
		s.state.ErrorCount++
	} else {
		s.state.LastError = errorType
		s.state.ErrorCount = 1
	}

	if s.state.ErrorCount >= 2 {
		s.sendGeneratedHint(errorHints[errorType], errorType)
	}
}

func (s *simulator) sendGeneratedHint(triggerFallback, errorType string) {
	if triggerFallback == "" {
		triggerFallback = genericHintFallback
	}

	problemID := s.state.ProblemID
	code := s.state.CodeSnapshot
	if code == "" {
		code = s.state.LastRunCode
	}

	go func() {
		ctx, cancel := context.WithTimeout(s.ctx, hintAPITimeout)
		defer cancel()

		text, err := callHintAPI(ctx, s.hintAPIURL, problemID, code, errorType)
		if err != nil || strings.TrimSpace(text) == "" {
			s.logger.Debug("hint api failed; using trigger fallback", "err", err)
			text = triggerFallback
		}
		s.send(text)
	}()
}

func (s *simulator) send(text string) {
	select {
	case s.outbound <- interviewerMessage{Type: "interviewer_message", Text: text}:
	case <-s.ctx.Done():
	default:
		s.logger.Debug("dropping interview message; outbound queue full")
	}
}

func callHintAPI(ctx context.Context, apiURL, problemID, code, errorType string) (string, error) {
	if strings.TrimSpace(problemID) == "" {
		return "", errors.New("problem_id required")
	}

	payload, err := json.Marshal(hintRequest{
		ProblemID: problemID,
		Code:      code,
		ErrorType: errorType,
		Evaluation: dto.StructuredEvaluation{
			Status:        dto.ProblemStatus(errorType),
			SyntaxOK:      true,
			FunctionFound: true,
			SignatureOK:   true,
		},
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(payload))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()

	if res.StatusCode < http.StatusOK || res.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, res.Body)
		return "", fmt.Errorf("hint api returned %s", res.Status)
	}

	var out hintResponse
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.InterviewerFeedback) != "" {
		return out.InterviewerFeedback, nil
	}
	return out.Hint, nil
}

func isValidErrorType(errorType string) bool {
	switch errorType {
	case "runtime_error", "wrong", "partial", "correct":
		return true
	default:
		return false
	}
}
