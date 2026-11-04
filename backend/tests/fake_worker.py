"""`python -m tests.fake_worker`: the real worker, with fake chat models installed."""

from tests import fakes

fakes.install()

from app.worker import main  # noqa: E402

main()
