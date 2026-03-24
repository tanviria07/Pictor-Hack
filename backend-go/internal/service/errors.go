package service

import "errors"

// ErrUnsupportedLanguage is returned when language is not python (MVP).
var ErrUnsupportedLanguage = errors.New("only python is supported in MVP")
