# Probability & Statistics

The mathematics of uncertainty and inference.

## Bayes' Theorem

$$
P(A \mid B) = \frac{P(B \mid A)\,P(A)}{P(B)}
$$

How to update beliefs in light of new evidence.

## Normal Distribution

$$
f(x) = \frac{1}{\sigma\sqrt{2\pi}}\,\exp\!\left(-\frac{(x-\mu)^2}{2\sigma^2}\right)
$$

The bell curve — the most important distribution in statistics.

## Law of Large Numbers

$$
\bar{X}_n \xrightarrow{a.s.} \mu \quad \text{as } n \to \infty
$$

Sample averages converge to the true mean as sample size grows.

## Central Limit Theorem

$$
\sqrt{n}\left(\bar{X}_n - \mu\right) \xrightarrow{d} \mathcal{N}(0, \sigma^2)
$$

The sum of many independent random variables tends toward a normal distribution.

## Entropy (Shannon)

$$
H(X) = -\sum_{x} p(x)\log p(x)
$$

The average information content of a random variable.

## Maximum Likelihood

$$
\hat{\theta} = \underset{\theta}{\arg\max}\; \mathcal{L}(\theta \mid x_1, \ldots, x_n)
$$

Choose the parameters that make the observed data most probable.

## Markov Inequality

$$
P(X \geq a) \leq \frac{\mathbb{E}[X]}{a}, \quad a > 0
$$

A bound on the tail of any non-negative random variable.

## Moment Generating Function

$$
M_X(t) = \mathbb{E}\!\left[e^{tX}\right] = \sum_{k=0}^{\infty} \frac{t^k}{k!}\,\mathbb{E}[X^k]
$$
