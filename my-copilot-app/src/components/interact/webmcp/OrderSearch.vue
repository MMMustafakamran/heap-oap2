<script setup lang="ts">
import { z } from "zod";
import { useFrontendTool } from "@copilotkit/vue/v2";
// HARNESS: searchOrders() is the reader's own app function (doc placeholder, never defined); trivial stub.
const searchOrders = async (status: string) => [{ id: "A-1001", status, item: "Desk lamp" }];

useFrontendTool({
  name: "searchOrders",
  description: "Search the signed-in user's orders by status",
  parameters: z.object({
    status: z.enum(["open", "shipped", "delivered"]),
  }),
  handler: async ({ status }) => {
    const orders = await searchOrders(status);
    return JSON.stringify(orders);
  },
  webmcp: {
    annotations: {
      readOnlyHint: true,
    },
  },
});
</script>
