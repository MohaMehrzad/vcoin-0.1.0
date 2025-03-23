# Contributing to VCoin Token-2022

Thank you for your interest in contributing to the VCoin Token-2022 project! This document provides guidelines and instructions for contributing.

## Code of Conduct

Please follow these guidelines when contributing:

1. Be respectful and inclusive.
2. Focus on the issue at hand, not the person.
3. Be open to feedback and willing to learn.
4. Help others when you can.

## Getting Started

1. **Fork the Repository**: Start by forking the repository to your GitHub account.

2. **Clone Your Fork**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/vcoin.git
   cd vcoin
   ```

3. **Set Up the Development Environment**:
   ```bash
   npm install
   ```

4. **Set Up Environment Variables**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

## Development Workflow

1. **Create a New Branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make Your Changes**: Implement your changes, following the code style and testing guidelines.

3. **Write Tests**: Add tests for your changes.

4. **Run Tests**:
   ```bash
   npm test
   ```

5. **Run Linters**:
   ```bash
   npm run lint
   ```

6. **Commit Your Changes**:
   ```bash
   git commit -m "feat: Add feature X"
   ```
   
   Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `style:` for formatting changes
   - `refactor:` for code refactoring
   - `test:` for adding or modifying tests
   - `chore:` for routine tasks and maintenance

7. **Push Your Changes**:
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Create a Pull Request**: Open a pull request from your fork to the main repository.

## Pull Request Process

1. **Title**: Use a descriptive title that summarizes the change.
2. **Description**: Provide a detailed description of the changes.
3. **References**: Link to any related issues or discussions.
4. **Continuous Integration**: Ensure all CI checks pass.
5. **Code Review**: Address any feedback from code reviewers.
6. **Approval**: Wait for approval from maintainers.

## Code Style Guide

- Follow the existing code style in the project.
- Use TypeScript for client code and Rust for Solana programs.
- Add appropriate comments and documentation.
- Ensure your code passes all linter checks.

## Testing Guidelines

- Write unit tests for all new functions.
- Write integration tests for complex interactions.
- Ensure all tests pass before submitting a pull request.
- Aim for high code coverage.

## Documentation

- Update documentation when adding or changing features.
- Follow the existing documentation style.
- Use clear, concise language.

## Working with Solana Programs

When working with Solana programs:

1. **Local Development**:
   ```bash
   # Start a local validator
   solana-test-validator
   
   # Build and deploy the program
   npm run build:program
   npm run deploy:program
   ```

2. **Testing Programs**:
   ```bash
   cd program
   cargo test
   ```

## License

By contributing to this project, you agree that your contributions will be licensed under the same license as the project.

## Questions and Support

If you have questions or need support:

1. **GitHub Issues**: For bugs and feature requests.
2. **Discussions**: For general questions and discussions.

Thank you for contributing to VCoin Token-2022! 