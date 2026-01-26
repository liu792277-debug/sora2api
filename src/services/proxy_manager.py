"""Proxy management module"""
import random
import re
import string
from typing import Optional, Dict, Any
from ..core.database import Database
from ..core.models import ProxyConfig

class ProxyManager:
    """Proxy configuration manager"""

    def __init__(self, db: Database):
        self.db = db
        self._task_proxies: Dict[str, Dict[str, Any]] = {}

    @staticmethod
    def _generate_sid(length: int = 8) -> str:
        return "".join(random.choices(string.ascii_letters + string.digits, k=length))

    @staticmethod
    def _replace_sid(proxy_url: str, sid: str) -> str:
        if not proxy_url:
            return proxy_url
        if re.search(r"sid-", proxy_url, flags=re.IGNORECASE):
            return re.sub(r"(sid-)([^-:@/?]+)", rf"\1{sid}", proxy_url, count=1, flags=re.IGNORECASE)
        if re.search(r"sid=", proxy_url, flags=re.IGNORECASE):
            return re.sub(r"(sid=)([^&?#]+)", rf"\1{sid}", proxy_url, count=1, flags=re.IGNORECASE)
        return proxy_url

    def _get_task_proxy(self, task_id: str, base_proxy_url: Optional[str]) -> Optional[str]:
        if not task_id or not base_proxy_url:
            return base_proxy_url

        if task_id in self._task_proxies:
            return self._task_proxies[task_id]["proxy_url"]

        sid = self._generate_sid()
        proxy_url = self._replace_sid(base_proxy_url, sid)
        self._task_proxies[task_id] = {
            "base_proxy_url": base_proxy_url,
            "proxy_url": proxy_url,
            "sid": sid,
        }
        return proxy_url

    def bind_task_proxy(self, task_key: str, task_id: str) -> None:
        if not task_key or not task_id or task_key == task_id:
            return
        task_proxy = self._task_proxies.pop(task_key, None)
        if task_proxy and task_id not in self._task_proxies:
            self._task_proxies[task_id] = task_proxy

    def release_task_proxy(self, task_id: Optional[str]) -> None:
        if task_id:
            self._task_proxies.pop(task_id, None)

    def rotate_task_proxy(self, task_id: Optional[str]) -> Optional[str]:
        if not task_id:
            return None
        task_proxy = self._task_proxies.get(task_id)
        if not task_proxy:
            return None
        sid = self._generate_sid()
        task_proxy["sid"] = sid
        task_proxy["proxy_url"] = self._replace_sid(task_proxy["base_proxy_url"], sid)
        return task_proxy["proxy_url"]

    async def get_proxy_url(
        self,
        token_id: Optional[int] = None,
        proxy_url: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Optional[str]:
        """Get proxy URL for a token, with fallback to global proxy

        Args:
            token_id: Token ID (optional). If provided, returns token-specific proxy if set,
                     otherwise falls back to global proxy.
            proxy_url: Direct proxy URL (optional). If provided, returns this proxy URL directly.
            task_id: Task ID (optional). If provided, returns task-specific proxy URL with sid.

        Returns:
            Proxy URL string or None
        """
        # If proxy_url is directly provided, use it
        if proxy_url:
            return self._get_task_proxy(task_id, proxy_url)

        # If token_id is provided, try to get token-specific proxy first
        if token_id is not None:
            token = await self.db.get_token(token_id)
            if token and token.proxy_url:
                return self._get_task_proxy(task_id, token.proxy_url)

        # Fall back to global proxy
        config = await self.db.get_proxy_config()
        if config.proxy_enabled and config.proxy_url:
            return self._get_task_proxy(task_id, config.proxy_url)
        return None

    async def update_proxy_config(self, enabled: bool, proxy_url: Optional[str]):
        """Update proxy configuration"""
        await self.db.update_proxy_config(enabled, proxy_url)

    async def get_proxy_config(self) -> ProxyConfig:
        """Get proxy configuration"""
        return await self.db.get_proxy_config()
