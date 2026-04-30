package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
)

type EmailSender interface {
	Send(ctx context.Context, msg EmailMessage) error
}

type EmailMessage struct {
	To      string
	Subject string
	Text    string
}

func NewEmailSenderFromEnv(provider, from, apiKey string) EmailSender {
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "" {
		provider = "dummy"
	}
	if from == "" {
		from = "noreply@kitkode.local"
	}
	switch provider {
	case "dummy":
		return &DummyEmailSender{From: from, Writer: os.Stderr}
	case "resend", "sendgrid":
		return &ExternalEmailSender{Provider: provider, From: from, APIKey: apiKey}
	default:
		log.Printf("unknown EMAIL_PROVIDER %q; falling back to dummy", provider)
		return &DummyEmailSender{From: from, Writer: os.Stderr}
	}
}

type DummyEmailSender struct {
	From   string
	Writer io.Writer
}

func (s *DummyEmailSender) Send(_ context.Context, msg EmailMessage) error {
	if s.Writer == nil {
		s.Writer = os.Stderr
	}
	_, err := fmt.Fprintf(s.Writer, "[EMAIL] from=%s to=%s subject=%q\n[EMAIL] %s\n", s.From, msg.To, msg.Subject, msg.Text)
	return err
}

type ExternalEmailSender struct {
	Provider string
	From     string
	APIKey   string
}

func (s *ExternalEmailSender) Send(context.Context, EmailMessage) error {
	if strings.TrimSpace(s.APIKey) == "" {
		return errors.New("EMAIL_API_KEY is required for " + s.Provider)
	}
	return errors.New(s.Provider + " email provider is configured but not implemented in this build")
}

func verificationEmail(email, otp string) EmailMessage {
	return EmailMessage{
		To:      email,
		Subject: "Verify your Kitkode email",
		Text:    fmt.Sprintf("Your Kitkode verification code is %s. It expires in 10 minutes.", otp),
	}
}

func passwordResetEmail(email, token string) EmailMessage {
	return EmailMessage{
		To:      email,
		Subject: "Reset your Kitkode password",
		Text:    fmt.Sprintf("Use this password reset token within 30 minutes: %s", token),
	}
}
