<script setup lang="ts">
import { useConnectionStore } from '@/stores/connection'

const connStore = useConnectionStore()
</script>

<template>
  <div class="connections-page">
    <h2>连接设置</h2>
    <p>配置 OpenClaw Gateway 和 Hermes Agent 的连接参数。</p>

    <!-- TODO: Phase 1 - Build connection configuration UI -->
    <div class="placeholder">
      <p>此页面将在后续阶段实现，包括：</p>
      <ul>
        <li>OpenClaw WebSocket 地址与 Token 配置</li>
        <li>Hermes API 地址与 API Key 配置</li>
        <li>连接测试与状态监控</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.connections-page {
  max-width: 800px;
}

.placeholder {
  margin-top: 24px;
  padding: 24px;
  border: 1px dashed var(--border-color, #e0e0e0);
  border-radius: 8px;
  color: var(--text-secondary, #666);
}

.placeholder ul {
  margin-top: 12px;
  padding-left: 24px;
}

.placeholder li {
  margin-bottom: 8px;
}
</style>
