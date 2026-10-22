import { Composition } from "remotion";
import { RokiDaily, type Props } from "./Video";
import { RokiInk } from "./Ink";

const empty: Props = { label: "", audio: "", duration: 10, lines: [], scenes: [] };

export const Root = () => (
  <>
  <Composition id="RokiInk" component={RokiInk} width={1080} height={1920} fps={30} durationInFrames={300} defaultProps={empty}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(props.duration * 30) })} />
  <Composition id="RokiDaily" component={RokiDaily} width={1080} height={1920} fps={30} durationInFrames={300} defaultProps={empty}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.ceil(props.duration * 30) })} />
  </>
);
