# Code Clone Detector - Full-Stack Application

A web-based code clone detection tool that analyzes source code for duplicate patterns, code quality metrics, and provides refactoring suggestions.

## Overview

This repository contains a Flask-based backend API and frontend components for detecting code clones and analyzing code quality.

## Repository Structure

```
Code_Clone_Detector-FL/
├── backend/              # Flask API backend
│   ├── app/             # Application code
│   │   ├── api/         # API endpoints
│   │   ├── services/    # Business logic
│   │   ├── utils/       # Utility functions
│   │   └── models/      # Data models
│   ├── tests/           # Test suite
│   └── requirements.txt # Python dependencies
└── GIT_TROUBLESHOOTING.md  # Git help guide
```

## Getting Started

### Prerequisites

- Python 3.8 or higher
- pip (Python package manager)
- Git

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Gabzxcv/Code_Clone_Detector-FL.git
   cd Code_Clone_Detector-FL
   ```

2. Set up the backend:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. Run the tests:
   ```bash
   python -m pytest tests/ -v
   ```

4. Start the development server:
   ```bash
   python run.py
   ```

## Running Tests

The project uses pytest for testing:

```bash
cd backend
python -m pytest tests/ -v
```

To run specific test files:
```bash
python -m pytest tests/test_validators.py -v
python -m pytest tests/test_analyzer.py -v
```

## Features

- **Code Analysis**: Analyze Python and Java code
- **Clone Detection**: Identify duplicate code patterns
- **Quality Metrics**: Calculate cyclomatic complexity and maintainability index
- **Refactoring Suggestions**: Get recommendations for code improvements

## API Documentation

See [backend/API_SPEC.md](backend/API_SPEC.md) for detailed API documentation.

## Development

### Supported Languages

Currently supports:
- Python
- Java

### Branch Workflow

- `main` - Production-ready code
- `feature/*` - New features
- `fix/*` - Bug fixes
- Development branches like `Allen_code_test` for testing

## Troubleshooting

Encountering Git issues? Check our [Git Troubleshooting Guide](GIT_TROUBLESHOOTING.md) for help with:
- Branch resolution errors
- Push/pull issues
- Common Git workflows

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Testing

All code changes should include tests. The test suite covers:
- Request validators
- Code analyzer
- Syntax validation
- Metrics calculation

## License

This project is part of the Fusion Logic codebase.

## Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Note**: If you encounter the error "fatal: [branch_name] cannot be resolved to branch", please refer to our [Git Troubleshooting Guide](GIT_TROUBLESHOOTING.md).
