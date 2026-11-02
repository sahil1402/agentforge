-- DropForeignKey
ALTER TABLE "runs" DROP CONSTRAINT "runs_graph_id_fkey";

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graphs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
