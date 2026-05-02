package interview

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"pictorhack/backend/internal/dto"
)

const (
	defaultHintAPIURL = "http://127.0.0.1:8080/api/hint"
	writeWait         = 5 * time.Second
	hintTimeout       = 2 * time.Second
	runPause          = 30 * time.Second
)

type SessionState struct {
	ProblemID          string
	CurrentLine        int
	DwellSeconds       int
	LastError          string
	ConsecutiveErrors  int
	LastRunCode        string
	CodeSnapshot       string
	LastRunAt          time.Time
	LastCodeChangeAt   time.Time
	LastDwellNudgeLine int
	PendingRunReminder bool
}

type Event struct {
	Type      string `json:"type"`
	ProblemID string `json:"problem_id,omitempty"`
	Line      int    `json:"line,omitempty"`
	Seconds   int    `json:"seconds,omitempty"`
	ErrorType string `json:"error_type,omitempty"`
	Code      string `json:"code,omitempty"`
}

type interviewerMessage struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type Interviewer struct {
	conn       *websocket.Conn
	ctx        context.Context
	cancel     context.CancelFunc
	state      SessionState
	logger     *slog.Logger
	hintAPIURL string
	events     chan Event
	outbound   chan interviewerMessage
}

var upgrader = websocket.Upgrader{CheckOrigin: allowLocalOrigin}

func WebSocketHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("interview websocket upgrade failed", "err", err)
		return
	}
	ctx, cancel := context.WithCancel(r.Context())
	(&Interviewer{
		conn:       conn,
		ctx:        ctx,
		cancel:     cancel,
		logger:     slog.Default().With("component", "interview_ws"),
		hintAPIURL: defaultHintAPIURL,
		events:     make(chan Event, 16),
		outbound:   make(chan interviewerMessage, 8),
	}).Run()
}

func (i *Interviewer) Run() {
	defer func() {
		i.cancel()
		_ = i.conn.Close()
	}()
	go i.readLoop()
	go i.writeLoop()

	var runReminder <-chan time.Time
	var runTimer *time.Timer
	stopTimer := func() {
		if runTimer == nil {
			return
		}
		if !runTimer.Stop() {
			select {
			case <-runTimer.C:
			default:
			}
		}
		runTimer, runReminder = nil, nil
	}
	resetTimer := func() {
		stopTimer()
		runTimer = time.NewTimer(runPause)
		runReminder = runTimer.C
	}

	for {
		select {
		case <-i.ctx.Done():
			stopTimer()
			return
		case <-runReminder:
			runTimer, runReminder = nil, nil
			if i.state.PendingRunReminder {
				i.send("Your code changed - consider running it to see if the new version fixes the issue.")
				i.state.PendingRunReminder = false
			}
		case ev, ok := <-i.events:
			if !ok {
				stopTimer()
				return
			}
			if !i.applyEvent(ev, resetTimer, stopTimer) {
				i.evaluateTriggers(ev)
			}
		}
	}
}

func (i *Interviewer) readLoop() {
	defer func() {
		i.cancel()
		close(i.events)
	}()
	for {
		var ev Event
		if err := i.conn.ReadJSON(&ev); err != nil {
			if !websocket.IsCloseError(err, websocket.CloseNormalClosure, websocket.CloseGoingAway) {
				i.logger.Debug("interview websocket read closed", "err", err)
			}
			return
		}
		select {
		case i.events <- ev:
		case <-i.ctx.Done():
			return
		}
	}
}

func (i *Interviewer) writeLoop() {
	for {
		select {
		case <-i.ctx.Done():
			return
		case msg := <-i.outbound:
			_ = i.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := i.conn.WriteJSON(msg); err != nil {
				i.logger.Debug("interview websocket write failed", "err", err)
				i.cancel()
				return
			}
		}
	}
}

func (i *Interviewer) applyEvent(ev Event, resetRunReminder, stopRunReminder func()) bool {
	switch ev.Type {
	case "start_session":
		i.state = SessionState{ProblemID: strings.TrimSpace(ev.ProblemID)}
	case "cursor_move":
		if ev.Line > 0 && ev.Line != i.state.CurrentLine {
			i.state.CurrentLine, i.state.DwellSeconds = ev.Line, 0
		}
	case "dwell_tick":
		if ev.Line > 0 {
			i.state.CurrentLine = ev.Line
		}
		i.state.DwellSeconds = ev.Seconds
		return false
	case "code_change":
		i.state.CodeSnapshot = ev.Code
		i.state.LastCodeChangeAt = time.Now()
		i.state.PendingRunReminder = true
		resetRunReminder()
	case "run_attempt":
		i.state.LastRunAt = time.Now()
		i.state.LastRunCode = ev.Code
		if ev.Code != "" {
			i.state.CodeSnapshot = ev.Code
		}
		i.updateErrorPattern(strings.TrimSpace(ev.ErrorType))
		i.state.PendingRunReminder = false
		stopRunReminder()
		return false
	default:
		i.logger.Debug("unknown interview event", "type", ev.Type)
	}
	return true
}

func (i *Interviewer) updateErrorPattern(errorType string) {
	if errorType == "" {
		return
	}
	if errorType == i.state.LastError {
		i.state.ConsecutiveErrors++
		return
	}
	i.state.LastError = errorType
	i.state.ConsecutiveErrors = 1
}

func (i *Interviewer) evaluateTriggers(ev Event) {
	if msg := i.checkDwellTrigger(); msg != "" {
		i.send(msg)
		return
	}
	if ev.Type != "run_attempt" {
		return
	}
	if ev.ErrorType == "correct" {
		i.send("Great! All tests passed. Can you think of an edge case where this might break?")
		return
	}
	if msg := i.checkErrorPatternTrigger(); msg != "" {
		i.sendHint(msg, i.state.LastError)
	}
}

func (i *Interviewer) sendHint(fallback, errorType string) {
	problemID, code := i.state.ProblemID, i.state.CodeSnapshot
	if code == "" {
		code = i.state.LastRunCode
	}
	go func() {
		ctx, cancel := context.WithTimeout(i.ctx, hintTimeout)
		defer cancel()
		text, err := callHintAPIWithContext(ctx, i.hintAPIURL, problemID, code, errorType)
		if err != nil || strings.TrimSpace(text) == "" {
			text = fallback
		}
		i.send(text)
	}()
}

func (i *Interviewer) checkDwellTrigger() string {
	return checkDwellTrigger(&i.state)
}

func (i *Interviewer) checkErrorPatternTrigger() string {
	return checkErrorPatternTrigger(&i.state)
}

func (i *Interviewer) send(text string) {
	select {
	case i.outbound <- interviewerMessage{Type: "interviewer_message", Text: text}:
	case <-i.ctx.Done():
	default:
		i.logger.Debug("dropping interview message; outbound queue full")
	}
}

func checkDwellTrigger(state *SessionState) string {
	if state.CurrentLine <= 0 || state.DwellSeconds < 60 || state.LastDwellNudgeLine == state.CurrentLine {
		return ""
	}
	state.LastDwellNudgeLine = state.CurrentLine
	return "You've been on line " + strconv.Itoa(state.CurrentLine) + " for a while. Would you like a hint about the loop condition?"
}

func checkErrorPatternTrigger(state *SessionState) string {
	if state.LastError == "" || state.LastError == "correct" || state.ConsecutiveErrors < 2 {
		return ""
	}
	switch state.LastError {
	case "runtime_error":
		return "Index out of range again - check your list bounds and any loop limits."
	case "wrong":
		return "The same wrong-answer pattern repeated. Try tracing one visible example by hand before changing more code."
	case "partial":
		return "Some tests are still failing. Which edge case is different from the cases that already pass?"
	default:
		return "You're seeing the same result again. What assumption could you test with a smaller input?"
	}
}

func callHintAPI(problemID, code, errorType string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), hintTimeout)
	defer cancel()
	return callHintAPIWithContext(ctx, defaultHintAPIURL, problemID, code, errorType)
}

func callHintAPIWithContext(ctx context.Context, apiURL, problemID, code, errorType string) (string, error) {
	if strings.TrimSpace(problemID) == "" {
		return "", errors.New("problem_id required")
	}
	body, err := json.Marshal(dto.HintRequest{
		ProblemID: problemID,
		Code:      code,
		Evaluation: dto.StructuredEvaluation{
			Status:          dto.ProblemStatus(errorType),
			SyntaxOK:        errorType != "syntax_error",
			FunctionFound:   true,
			SignatureOK:     true,
			FeedbackTargets: []string{"Ask a leading question; do not judge correctness."},
		},
	})
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", errors.New("hint api status " + res.Status)
	}
	var out struct {
		Hint                string `json:"hint"`
		InterviewerFeedback string `json:"interviewer_feedback"`
	}
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		return "", err
	}
	if strings.TrimSpace(out.InterviewerFeedback) != "" {
		return out.InterviewerFeedback, nil
	}
	return out.Hint, nil
}

func allowLocalOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return u.Host == r.Host || u.Host == "localhost:3000" || u.Host == "127.0.0.1:3000"
}
