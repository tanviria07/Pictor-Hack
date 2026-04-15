package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"

	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/problems"
)

// ErrJobNotFound is returned when no async run job exists for the id.
var ErrJobNotFound = errors.New("job not found")

type jobMeta struct {
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}

type queuePayload struct {
	JobID     string `json:"job_id"`
	ProblemID string `json:"problem_id"`
	Language  string `json:"language"`
	Code      string `json:"code"`
}

// RunJobService enqueues Python evaluation jobs on Redis for worker consumption.
type RunJobService struct {
	rdb    *redis.Client
	cfg    config.Config
	runs   *RunService
	queue  string
	jobP   string
	reqP   string
	rawP   string
	finalP string
	lockP  string
	ttl    time.Duration
}

// NewRunJobService wires Redis-backed async runs. cfg.RedisURL must be non-empty.
func NewRunJobService(cfg config.Config, rdb *redis.Client, runs *RunService) *RunJobService {
	return &RunJobService{
		rdb:    rdb,
		cfg:    cfg,
		runs:   runs,
		queue:  cfg.RunQueueKey,
		jobP:   cfg.RunJobKeyPrefix,
		reqP:   cfg.RunReqKeyPrefix,
		rawP:   cfg.RunRawKeyPrefix,
		finalP: cfg.RunFinalKeyPrefix,
		lockP:  cfg.RunFinalizeLockPrefix,
		ttl:    cfg.RunJobTTL,
	}
}

func (s *RunJobService) jobKey(id string) string   { return s.jobP + id }
func (s *RunJobService) reqKey(id string) string   { return s.reqP + id }
func (s *RunJobService) rawKey(id string) string   { return s.rawP + id }
func (s *RunJobService) finalKey(id string) string { return s.finalP + id }
func (s *RunJobService) lockKey(id string) string  { return s.lockP + id }

// Submit validates input, stores metadata, and pushes to the worker queue.
func (s *RunJobService) Submit(ctx context.Context, req dto.RunRequest) (*dto.RunJobSubmitResponse, error) {
	if req.Language != "" && req.Language != "python" {
		return nil, ErrUnsupportedLanguage
	}
	if req.Language == "" {
		req.Language = "python"
	}
	if _, err := problems.GetPublic(req.ProblemID); err != nil {
		return nil, err
	}

	id := uuid.New().String()
	meta := jobMeta{Status: "pending"}
	metaB, err := json.Marshal(meta)
	if err != nil {
		return nil, err
	}
	reqB, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}
	msg, err := json.Marshal(queuePayload{
		JobID:     id,
		ProblemID: req.ProblemID,
		Language:  req.Language,
		Code:      req.Code,
	})
	if err != nil {
		return nil, err
	}

	pipe := s.rdb.Pipeline()
	pipe.Set(ctx, s.jobKey(id), metaB, s.ttl)
	pipe.Set(ctx, s.reqKey(id), reqB, s.ttl)
	pipe.LPush(ctx, s.queue, string(msg))
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, fmt.Errorf("enqueue run job: %w", err)
	}

	return &dto.RunJobSubmitResponse{JobID: id, Status: "pending"}, nil
}

// GetJob returns job status and, when completed, the finalized RunResponse (incl. DeepSeek phrasing).
func (s *RunJobService) GetJob(ctx context.Context, jobID string) (*dto.RunJobPollResponse, error) {
	metaJSON, err := s.rdb.Get(ctx, s.jobKey(jobID)).Result()
	if err == redis.Nil {
		return nil, ErrJobNotFound
	}
	if err != nil {
		return nil, err
	}

	var meta jobMeta
	if err := json.Unmarshal([]byte(metaJSON), &meta); err != nil {
		return nil, fmt.Errorf("job meta: %w", err)
	}

	out := &dto.RunJobPollResponse{JobID: jobID, Status: meta.Status}
	if meta.Status == "failed" {
		e := meta.Error
		out.Error = &e
		return out, nil
	}
	if meta.Status != "completed" {
		return out, nil
	}

	finalJSON, err := s.rdb.Get(ctx, s.finalKey(jobID)).Result()
	if err == nil {
		var resp dto.RunResponse
		if err := json.Unmarshal([]byte(finalJSON), &resp); err != nil {
			return nil, err
		}
		out.Result = &resp
		return out, nil
	}
	if err != redis.Nil {
		return nil, err
	}

	rawJSON, err := s.rdb.Get(ctx, s.rawKey(jobID)).Result()
	if err == redis.Nil {
		return out, nil
	}
	if err != nil {
		return nil, err
	}

	var resp dto.RunResponse
	if err := json.Unmarshal([]byte(rawJSON), &resp); err != nil {
		return nil, err
	}

	reqJSON, err := s.rdb.Get(ctx, s.reqKey(jobID)).Result()
	if err != nil {
		return nil, fmt.Errorf("run request key: %w", err)
	}
	var runReq dto.RunRequest
	if err := json.Unmarshal([]byte(reqJSON), &runReq); err != nil {
		return nil, err
	}

	lockK := s.lockKey(jobID)
	gotLock, err := s.rdb.SetNX(ctx, lockK, "1", 30*time.Second).Result()
	if err != nil {
		return nil, err
	}
	if gotLock {
		s.runs.ApplyCoachFeedback(ctx, runReq, &resp)
		finalB, err := json.Marshal(resp)
		if err != nil {
			_ = s.rdb.Del(ctx, lockK)
			return nil, err
		}
		if err := s.rdb.Set(ctx, s.finalKey(jobID), finalB, s.ttl).Err(); err != nil {
			_ = s.rdb.Del(ctx, lockK)
			return nil, err
		}
		_ = s.rdb.Del(ctx, lockK)
		out.Result = &resp
		return out, nil
	}

	for i := 0; i < 60; i++ {
		time.Sleep(50 * time.Millisecond)
		finalJSON, err := s.rdb.Get(ctx, s.finalKey(jobID)).Result()
		if err == nil {
			var r2 dto.RunResponse
			if err := json.Unmarshal([]byte(finalJSON), &r2); err != nil {
				return nil, err
			}
			out.Result = &r2
			return out, nil
		}
		if err != redis.Nil {
			return nil, err
		}
	}

	s.runs.ApplyCoachFeedback(ctx, runReq, &resp)
	finalB, err := json.Marshal(resp)
	if err != nil {
		return nil, err
	}
	_ = s.rdb.Set(ctx, s.finalKey(jobID), finalB, s.ttl).Err()
	out.Result = &resp
	return out, nil
}
