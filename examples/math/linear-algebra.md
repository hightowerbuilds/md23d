# Linear Algebra

The mathematics of vectors, matrices, and linear transformations.

## Matrix Multiplication

$$
(AB)_{ij} = \sum_{k=1}^{n} A_{ik} B_{kj}
$$

The entry in row i and column j of the product AB.

## Determinant (2×2)

$$
\det\begin{pmatrix} a & b \\ c & d \end{pmatrix} = ad - bc
$$

## Eigenvalue Equation

$$
A\mathbf{v} = \lambda\mathbf{v}
$$

A vector v is an eigenvector of A if multiplying by A only scales it.

## Characteristic Polynomial

$$
\det(A - \lambda I) = 0
$$

Eigenvalues are the roots of the characteristic polynomial.

## Change of Basis

$$
[T]_{\mathcal{B}'} = P^{-1}[T]_{\mathcal{B}}\, P
$$

The same linear map, expressed in a different coordinate system.

## Singular Value Decomposition

$$
A = U \Sigma V^{\top}
$$

Every matrix decomposes into rotation, scaling, and rotation.

## Least Squares

$$
\hat{\mathbf{x}} = (A^{\top}A)^{-1}A^{\top}\mathbf{b}
$$

The best approximate solution when no exact solution exists.

## Trace and Eigenvalues

$$
\text{tr}(A) = \sum_{i=1}^{n} \lambda_i \qquad \det(A) = \prod_{i=1}^{n} \lambda_i
$$

The trace equals the sum of eigenvalues. The determinant equals their product.
