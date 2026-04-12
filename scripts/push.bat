@echo off
:: push.bat — stage all changes, commit with a description, and push to GitHub
cd /d "%~dp0\.."

git status --porcelain > "%TEMP%\gitstatus.txt"
for %%A in ("%TEMP%\gitstatus.txt") do if %%~zA==0 (
  echo Nothing to commit - working tree is clean.
  pause
  exit /b 0
)

echo.
echo Changed files:
git status --short
echo.

set /p description="Commit description: "

if "%description%"=="" (
  echo Aborted - description cannot be empty.
  pause
  exit /b 1
)

git add -A
git commit -m "%description%"
git push origin HEAD

echo.
echo Done.
pause
