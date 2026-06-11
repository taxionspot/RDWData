import { FullReportScreen } from "@/components/vehicle/FullReportScreen";

type Props = {
  params: { plate: string };
};

export default function PlateResultPage({ params }: Props) {
  return <FullReportScreen plate={params.plate} />;
}
