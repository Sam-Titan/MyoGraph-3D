import { useHealth, useMetrics } from '@/api/queries'
import { QueryBoundary } from '@/features/layout/QueryBoundary'
import { fixed, pm } from '@/lib/format'
import { maxThresholdStd, WEAKER_GAP, weakerTargets } from './aboutModel'
import { PipelineDiagram } from './PipelineDiagram'

const H3 = 't-section'

export function AboutPanel() {
  const metrics = useMetrics()
  const health = useHealth()

  return (
    <div className="mx-auto min-w-0 max-w-3xl space-y-6 p-(--gutter) text-sm">
      <h2 className="text-xl font-semibold tracking-tight">About &amp; method</h2>

      <section className="space-y-2">
        <h3 className={H3}>What it does</h3>
        <p>
          MyoGraph takes routine clinical measurements and returns a calibrated model estimate of
          the probability of coronary artery disease overall and of stenosis in each main vessel.
          The estimates are mapped onto an interactive 3D heart, with a breakdown of which inputs
          pushed each estimate up or down.
        </p>
        <h4 className="pt-1 font-medium">Reading the 3D view</h4>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Colour is the calibrated probability for that vessel; the number is always shown too.
          </li>
          <li>Legend ticks mark each target’s decision threshold.</li>
          <li>Selecting a vessel rotates the heart to it.</li>
          <li>Dashed labels mark a vessel that sits behind the heart.</li>
        </ul>
      </section>

      <QueryBoundary query={metrics} what="model details">
        {(m) => {
          const nModels = Object.keys(m.targets).length
          const n = m.split.n_train + m.split.n_test
          const weaker = weakerTargets(m)
          return (
            <>
              <section className="space-y-2">
                <h3 className={H3}>Pipeline</h3>
                <PipelineDiagram nModels={nModels} />
              </section>

              <section className="space-y-2">
                <h3 className={H3}>Limitations</h3>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    <span className="num">n = {n}</span>, single-centre dataset; non-imaging
                    features only. Not clinically validated.
                  </li>
                  {weaker.length > 0 && (
                    <li>
                      {weaker.map((t, i) => (
                        <span key={t.id}>
                          {i > 0 && ', '}
                          {t.id} (CV ROC-AUC{' '}
                          <span className="num">
                            {pm(t.auc, m.targets[t.id].cv.default.roc_auc.std)}
                          </span>
                          )
                        </span>
                      ))}{' '}
                      {weaker.length === 1 ? 'is' : 'are'} harder to predict: at least{' '}
                      <span className="num">{fixed(WEAKER_GAP)}</span> below the overall target’s
                      cross-validated ROC-AUC.
                    </li>
                  )}
                  <li>
                    Decision thresholds are noisy with this sample size (up to{' '}
                    <span className="num">± {fixed(maxThresholdStd(m))}</span> across folds).
                  </li>
                  <li>
                    The WHY baseline is the model’s average estimate, not “zero risk”: bars show how
                    an input moves a patient away from that average.
                  </li>
                </ul>
              </section>
            </>
          )
        }}
      </QueryBoundary>

      <section className="space-y-2">
        <h3 className={H3}>Dataset</h3>
        <p>
          Alizadehsani, R., Roshanzamir, M., &amp; Sani, Z. (2013).{' '}
          <em>extention of Z-Alizadeh sani dataset</em> [Dataset]. UCI Machine Learning Repository.{' '}
          <a
            className="underline underline-offset-2"
            href="https://doi.org/10.24432/C5461K"
            target="_blank"
            rel="noreferrer"
          >
            doi.org/10.24432/C5461K
          </a>{' '}
          (CC BY 4.0).
        </p>
      </section>

      <section className="space-y-2">
        <h3 className={H3}>Disclaimer</h3>
        <p>
          This is decision-support and educational software. Outputs are model estimates of
          probability, not a diagnosis, and are not a substitute for diagnostic imaging or clinical
          judgement.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className={H3}>Privacy</h3>
        <p>
          The site counts page views and anonymous actions (such as which tab or preset was opened)
          with cookieless analytics that also shows country and device type. No cookies are set. The
          server logs the IP address and browser string of each request. Nothing typed into the
          patient form is ever stored, logged or sent to analytics. The optional AI summary sends
          the model’s results to Groq, as described next to that button.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className={H3}>Credits</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            3D anatomy: “BodyParts3D, © The Database Center for Life Science licensed under CC
            Attribution 4.0 International”. The derived heart model is released under CC BY-SA 4.0.
          </li>
          <li>Code is MIT-licensed.</li>
          <li>
            Model version: <span className="num">{health.data?.model_version ?? '—'}</span>
          </li>
        </ul>
      </section>
    </div>
  )
}
