package service

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"

	"pictorhack/backend/internal/config"
	"pictorhack/backend/internal/deepseek"
	"pictorhack/backend/internal/dto"
	"pictorhack/backend/internal/runner"
)

func TestRunJob_submitThenSimulatedWorker(t *testing.T) {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatal(err)
	}
	defer mr.Close()

	opt, err := redis.ParseURL("redis://" + mr.Addr() + "/0")
	if err != nil {
		t.Fatal(err)
	}
	rdb := redis.NewClient(opt)
	defer func() { _ = rdb.Close() }()

	cfg := config.Config{
		RunQueueKey:           "run:queue",
		RunJobKeyPrefix:       "run:job:",
		RunReqKeyPrefix:       "run:req:",
		RunRawKeyPrefix:       "run:raw:",
		RunFinalKeyPrefix:     "run:final:",
		RunFinalizeLockPrefix: "run:finlock:",
		RunJobTTL:             time.Hour,
	}

	runs := NewRunService(runner.New("http://127.0.0.1:1"), deepseek.New(config.Config{}))
	rj := NewRunJobService(cfg, rdb, runs)

	ctx := context.Background()
	sub, err := rj.Submit(ctx, dto.RunRequest{ProblemID: "two-sum", Language: "python", Code: "def twoSum(nums, target):\n    return []"})
	if err != nil {
		t.Fatalf("Submit: %v", err)
	}
	if sub.Status != "pending" || sub.JobID == "" {
		t.Fatalf("submit response: %+v", sub)
	}

	n, err := rdb.LLen(ctx, cfg.RunQueueKey).Result()
	if err != nil || n != 1 {
		t.Fatalf("queue len: %v err %v", n, err)
	}

	raw := dto.RunResponse{
		Status: dto.StatusCorrect,
		Evaluation: dto.StructuredEvaluation{
			Status:             dto.StatusCorrect,
			SyntaxOK:           true,
			FunctionFound:      true,
			SignatureOK:        true,
			PassedVisibleTests: 1,
			TotalVisibleTests:  1,
			PassedHiddenTests:  0,
			TotalHiddenTests:   0,
			LikelyStage:        "done",
			FeedbackTargets:    []string{},
			VisibleTestResults: []dto.VisibleTestResult{},
		},
		VisibleTestResults:  []dto.VisibleTestResult{},
		InterviewerFeedback: "ok",
	}
	rawB, _ := json.Marshal(raw)
	metaB, _ := json.Marshal(map[string]string{"status": "completed"})
	_ = rdb.Set(ctx, cfg.RunRawKeyPrefix+sub.JobID, string(rawB), 0).Err()
	_ = rdb.Set(ctx, cfg.RunJobKeyPrefix+sub.JobID, string(metaB), 0).Err()

	poll, err := rj.GetJob(ctx, sub.JobID)
	if err != nil {
		t.Fatalf("GetJob: %v", err)
	}
	if poll.Status != "completed" || poll.Result == nil {
		t.Fatalf("poll: %+v", poll)
	}
	if poll.Result.Status != dto.StatusCorrect {
		t.Fatalf("result status: %s", poll.Result.Status)
	}
}
